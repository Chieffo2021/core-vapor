import type {
  NodeTypes,
  RootNode,
  Node,
  TemplateChildNode,
  ElementNode,
  AttributeNode,
  InterpolationNode,
  TransformOptions,
  DirectiveNode,
  ExpressionNode,
} from '@vue/compiler-dom'
import {
  type OperationNode,
  type RootIRNode,
  IRNodeTypes,
  DynamicInfo,
} from './ir'
import { isVoidTag } from '@vue/shared'
import {
  ErrorCodes,
  createCompilerError,
  defaultOnError,
  defaultOnWarn,
} from './errors'

export interface TransformContext<T extends Node = Node> {
  node: T
  parent: TransformContext | null
  root: TransformContext<RootNode>
  index: number
  options: TransformOptions

  template: string // 静态节点内容
  dynamic: DynamicInfo // 动态节点内容

  once: boolean

  reference(): number // 注册/获取引用节点的 id
  incraseId(): number // 增加引用节点 id
  registerTemplate(): number // 添加根节点 <template></template>
  registerEffect(expr: string, operation: OperationNode): void // 订阅响应式对象 expr，注册事件 operation
  registerOpration(...oprations: OperationNode[]): void // 注册动态节点添加/更新操作
  helper(name: string): string
}

function createRootContext(
  ir: RootIRNode,
  node: RootNode,
  options: TransformOptions,
): TransformContext<RootNode> {
  let globalId = 0 // 引用节点 id，在根节点中共享
  const { effect, operation: operation, helpers, vaporHelpers } = ir

  const ctx: TransformContext<RootNode> = {
    node,
    parent: null,
    index: 0,
    root: null!, // set later
    options,
    dynamic: ir.dynamic,
    once: false,

    incraseId: () => globalId++,
    reference() {
      if (this.dynamic.id !== null) return this.dynamic.id
      this.dynamic.referenced = true
      return (this.dynamic.id = this.incraseId())
    },
    registerEffect(expr, operation) {
      if (this.once) {
        return this.registerOpration(operation)
      }
      if (!effect[expr]) effect[expr] = []
      effect[expr].push(operation)
    },

    template: '',
    registerTemplate() {
      if (!ctx.template) return -1

      const idx = ir.template.findIndex(
        (t) =>
          t.type === IRNodeTypes.TEMPLATE_FACTORY &&
          t.template === ctx.template,
      )
      if (idx !== -1) return idx

      ir.template.push({
        type: IRNodeTypes.TEMPLATE_FACTORY,
        template: ctx.template,
        loc: node.loc,
      })
      return ir.template.length - 1
    },
    registerOpration(...node) {
      operation.push(...node)
    },
    // TODO not used yet
    helper(name, vapor = true) {
      ;(vapor ? vaporHelpers : helpers).add(name)
      return name
    },
  }
  ctx.root = ctx
  ctx.reference() // 根节点的引用节点 id 为 0
  return ctx
}

function createContext<T extends TemplateChildNode>(
  node: T,
  parent: TransformContext,
  index: number,
): TransformContext<T> {
  const ctx: TransformContext<T> = {
    ...parent,
    node,
    parent,
    index,

    template: '',
    dynamic: {
      id: null,
      referenced: false,
      ghost: false,
      placeholder: null,
      children: {},
    },
  }
  return ctx
}

// AST -> IR
export function transform(
  root: RootNode,
  options: TransformOptions = {},
): RootIRNode {
  options.onError ||= defaultOnError
  options.onWarn ||= defaultOnWarn

  const ir: RootIRNode = {
    type: IRNodeTypes.ROOT,
    loc: root.loc,
    template: [],
    dynamic: {
      id: null,
      referenced: true,
      ghost: true,
      placeholder: null,
      children: {},
    },
    effect: Object.create(null),
    operation: [],
    helpers: new Set([]),
    vaporHelpers: new Set([]),
  }

  const ctx = createRootContext(ir, root, options)

  // TODO: transform presets, see packages/compiler-core/src/transforms
  transformChildren(ctx, true)
  if (ir.template.length === 0) {
    ir.template.push({
      type: IRNodeTypes.FRAGMENT_FACTORY,
      loc: root.loc,
    })
  }

  return ir
}

function transformChildren(
  ctx: TransformContext<RootNode | ElementNode>,
  root?: boolean,
) {
  const {
    node: { children },
  } = ctx
  const childrenTemplate: string[] = [] // 保存转换完成后的静态节点列表
  children.forEach((child, i) => walkNode(child, i))

  processDynamicChildren()
  ctx.template += childrenTemplate.join('')

  if (root) ctx.registerTemplate()

  // 循环所有的子节点，以引用节点（静态节点）为锚点，注册插入动态节点的操作
  function processDynamicChildren() {
    let prevChildren: DynamicInfo[] = []
    let hasStatic = false
    for (let index = 0; index < children.length; index++) {
      const child = ctx.dynamic.children[index]

      // 静态节点 或 引用节点（静态节点）
      if (!child || !child.ghost) {
        if (prevChildren.length)
          if (hasStatic) {
            // 动态节点在中间，当前遍历到的节点是 c
            // a{{b}}c
            childrenTemplate[index - prevChildren.length] = `<!>` // 添加动态节点占位符。todo 占位符具体作用未知
            // 把当前节点注册为引用节点，即锚点
            // 需要插入的动态节点通过 placeholder 关联引用节点（静态节点）
            const anchor = (prevChildren[0].placeholder = ctx.incraseId())

            // 注册插入节点操作，在 anchor 前面插入动态节点
            ctx.registerOpration({
              type: IRNodeTypes.INSERT_NODE,
              loc: ctx.node.loc,
              element: prevChildren.map((child) => child.id!), // prevChildren 保存了需要插入的动态节点
              parent: ctx.reference(),
              anchor,
            })
          } else {
            // 动态节点在前面。注册插入节点操作，在 parent 的子节点最前面插入动态节点
            // {{a}}b
            ctx.registerOpration({
              type: IRNodeTypes.PREPEND_NODE,
              loc: ctx.node.loc,
              elements: prevChildren.map((child) => child.id!),
              parent: ctx.reference(),
            })
          }
        hasStatic = true
        prevChildren = []
        continue
      }

      // 需要插入的动态节点
      prevChildren.push(child)

      // 动态节点在后面。注册插入节点操作，在 parent 的子节点最后面插入动态节点
      // a{{b}}
      if (index === children.length - 1) {
        ctx.registerOpration({
          type: IRNodeTypes.APPEND_NODE,
          loc: ctx.node.loc,
          elements: prevChildren.map((child) => child.id!),
          parent: ctx.reference(),
        })
      }
    }
  }

  // 对 template 节点进行转换
  function walkNode(node: TemplateChildNode, index: number) {
    const child = createContext(node, ctx, index)
    const isFirst = index === 0
    const isLast = index === children.length - 1

    switch (node.type) {
      case 1 satisfies NodeTypes.ELEMENT: {
        // 转换节点标签和 props，并调用 transformChildren 递归解析子节点
        transformElement(child as TransformContext<ElementNode>)
        break
      }
      case 2 satisfies NodeTypes.TEXT: {
        // 拼接文本
        child.template += node.content
        break
      }
      case 3 satisfies NodeTypes.COMMENT: {
        // 拼接注释
        child.template += `<!--${node.content}-->`
        break
      }
      case 5 satisfies NodeTypes.INTERPOLATION: {
        // 转换动态节点内容，即 template 的 {{}} 双尖括号
        transformInterpolation(
          child as TransformContext<InterpolationNode>,
          isFirst,
          isLast,
        )
        break
      }
      case 12 satisfies NodeTypes.TEXT_CALL:
        // never?
        break
      default: {
        // TODO handle other types
        // CompoundExpressionNode
        // IfNode
        // IfBranchNode
        // ForNode
        child.template += `[type: ${node.type}]`
      }
    }

    // 转换完成的静态节点内容先存起来
    childrenTemplate.push(child.template)

    // 保存引用节点到 children 中，有两个地方用到
    // 1. 在 processDynamicChildren 中，注册插入动态节点操作
    // 2. 生成运行时代码时：利用 index 和 dynamic.id 生成解构对象，获得引用节点（静态节点）
    if (
      child.dynamic.ghost ||
      child.dynamic.referenced ||
      child.dynamic.placeholder ||
      Object.keys(child.dynamic.children).length
    ) {
      ctx.dynamic.children[index] = child.dynamic
    }
  }
}

function transformElement(ctx: TransformContext<ElementNode>) {
  const { node } = ctx
  const { tag, props, children } = node

  ctx.template += `<${tag}`

  props.forEach((prop) => transformProp(prop, ctx)) // 转换 props
  ctx.template += `>`

  if (children.length) transformChildren(ctx)

  // TODO remove unnecessary close tag, e.g. if it's the last element of the template
  if (!isVoidTag(tag)) {
    ctx.template += `</${tag}>`
  }
}

// 对动态节点注册 创建节点操作 和 响应式更新操作
function transformInterpolation(
  ctx: TransformContext<InterpolationNode>,
  isFirst: boolean,
  isLast: boolean,
) {
  const { node } = ctx

  // 复合表达式
  if (node.content.type === (8 satisfies NodeTypes.COMPOUND_EXPRESSION)) {
    // TODO: CompoundExpressionNode: {{ count + 1 }}
    return
  }

  const expr = processExpression(ctx, node.content)! // 获取响应式对象，例如 obj.value

  if (isFirst && isLast) {
    // 只有一个子节点，即 {{count}}。直接注册父元素操作即可
    const parent = ctx.parent!
    const parentId = parent.reference() // 添加父节点为引用节点
    // 注册响应式更新操作
    ctx.registerEffect(expr, {
      type: IRNodeTypes.SET_TEXT,
      loc: node.loc,
      element: parentId,
      value: expr,
    })
  } else {
    const id = ctx.reference() // 注册创建的节点为引用节点
    ctx.dynamic.ghost = true
    // 注册创建动态节点操作
    ctx.registerOpration({
      type: IRNodeTypes.CREATE_TEXT_NODE,
      loc: node.loc,
      id,
      value: expr,
    })
    // 注册响应式更新操作
    ctx.registerEffect(expr, {
      type: IRNodeTypes.SET_TEXT,
      loc: node.loc,
      element: id,
      value: expr,
    })
  }
}

// 转换 props，如果是响应式对象，注册响应式操作
function transformProp(
  node: DirectiveNode | AttributeNode,
  ctx: TransformContext<ElementNode>,
): void {
  const { name } = node

  if (node.type === (6 satisfies NodeTypes.ATTRIBUTE)) {
    if (node.value) {
      ctx.template += ` ${name}="${node.value.content}"`
    } else {
      ctx.template += ` ${name}`
    }
    return
  }

  const { exp, loc, modifiers } = node

  const expr = processExpression(ctx, exp)
  switch (name) {
    case 'bind': {
      if (
        !exp ||
        (exp.type === (4 satisfies NodeTypes.SIMPLE_EXPRESSION) &&
          !exp.content.trim())
      ) {
        ctx.options.onError!(
          createCompilerError(ErrorCodes.VAPOR_BIND_NO_EXPRESSION, loc),
        )
        return
      }

      if (expr === null) {
        // TODO: Vue 3.4 supported shorthand syntax
        // https://github.com/vuejs/core/pull/9451
        return
      } else if (!node.arg) {
        // TODO support v-bind="{}"
        return
      } else if (
        node.arg.type === (8 satisfies NodeTypes.COMPOUND_EXPRESSION)
      ) {
        // TODO support :[foo]="bar"
        return
      }

      // 注册响应式更新操作
      ctx.registerEffect(expr, {
        type: IRNodeTypes.SET_PROP,
        loc: node.loc,
        element: ctx.reference(), // 添加当前节点为引用节点
        name: node.arg.content,
        value: expr,
      })
      break
    }
    case 'on': {
      if (!exp && !modifiers.length) {
        ctx.options.onError!(
          createCompilerError(ErrorCodes.VAPOR_ON_NO_EXPRESSION, loc),
        )
        return
      }

      if (!node.arg) {
        // TODO support v-on="{}"
        return
      } else if (
        node.arg.type === (8 satisfies NodeTypes.COMPOUND_EXPRESSION)
      ) {
        // TODO support @[foo]="bar"
        return
      } else if (expr === null) {
        // TODO: support @foo
        // https://github.com/vuejs/core/pull/9451
        return
      }

      ctx.registerEffect(expr, {
        type: IRNodeTypes.SET_EVENT,
        loc: node.loc,
        element: ctx.reference(),
        name: node.arg.content,
        value: expr,
      })
      break
    }
    case 'html': {
      const value = expr || '""'
      ctx.registerEffect(value, {
        type: IRNodeTypes.SET_HTML,
        loc: node.loc,
        element: ctx.reference(),
        value,
      })
      break
    }
    case 'text': {
      const value = expr || '""'
      ctx.registerEffect(value, {
        type: IRNodeTypes.SET_TEXT,
        loc: node.loc,
        element: ctx.reference(),
        value,
      })
      break
    }
    case 'once': {
      ctx.once = true
      break
    }
    case 'cloak': {
      // do nothing
      break
    }
  }
}

// 给响应式对象加上.value取值
// TODO: reuse packages/compiler-core/src/transforms/transformExpression.ts
function processExpression(
  ctx: TransformContext,
  expr: ExpressionNode | undefined,
): string | null {
  if (!expr) return null
  if (expr.type === (8 satisfies NodeTypes.COMPOUND_EXPRESSION)) {
    // TODO
    return ''
  }
  const { content } = expr
  if (ctx.options.bindingMetadata?.[content] === 'setup-ref') {
    return content + '.value'
  }
  return content
}
