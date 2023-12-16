import type { CodegenOptions, CodegenResult } from '@vue/compiler-dom'
import {
  type DynamicChildren,
  type RootIRNode,
  IRNodeTypes,
  OperationNode,
} from './ir'

// remove when stable
function checkNever(x: never): void {}

// IR -> JS codegen
export function generate(
  ir: RootIRNode,
  options: CodegenOptions = {},
): CodegenResult {
  let code = ''
  let preamble = '' // 需要放在前面的代码，如 import，const

  const { helpers, vaporHelpers } = ir

  // 生成静态节点代码
  ir.template.forEach((template, i) => {
    if (template.type === IRNodeTypes.TEMPLATE_FACTORY) {
      preamble += `const t${i} = template(${JSON.stringify(
        template.template,
      )})\n`
      vaporHelpers.add('template')
    } else {
      // todo fragment 什么情况下会出现？
      // fragment
      code += `const t0 = fragment()\n`
      vaporHelpers.add('fragment')
    }
  })

  {
    // 生成动态节点代码
    code += `const n${ir.dynamic.id} = t0()\n` // 生成运行时静态节点

    const children = genChildren(ir.dynamic.children)
    if (children) {
      code += `const ${children} = children(n${ir.dynamic.id})\n` // children 函数序列化运行时静态节点，通过解构引用节点
      vaporHelpers.add('children')
    }

    for (const operation of ir.operation) {
      code += genOperation(operation)
    }
    // 对引用节点生成响应式更新操作
    for (const [_expr, operations] of Object.entries(ir.effect)) {
      let scope = `effect(() => {\n`
      vaporHelpers.add('effect')
      for (const operation of operations) {
        scope += genOperation(operation)
      }
      scope += '})\n'
      code += scope
    }
    // TODO multiple-template
    // TODO return statement in IR
    code += `return n${ir.dynamic.id}\n`
  }

  if (vaporHelpers.size)
    preamble =
      `import { ${[...vaporHelpers].join(', ')} } from 'vue/vapor'\n` + preamble
  if (helpers.size)
    preamble = `import { ${[...helpers].join(', ')} } from 'vue'\n` + preamble

  // 上面生成的代码用 render 函数包起来
  const functionName = options.ssr ? `ssrRender` : `render`
  const isSetupInlined = !!options.inline
  if (isSetupInlined) {
    code = `(() => {\n${code}\n})();`
  } else {
    code = `${preamble}export function ${functionName}() {\n${code}\n}`
  }

  return {
    code,
    ast: ir as any,
    preamble,
  }

  // 生成引用节点的添加/更新操作
  function genOperation(oper: OperationNode) {
    let code = ''

    // TODO: cache old value
    switch (oper.type) {
      case IRNodeTypes.SET_PROP: {
        code = `setAttr(n${oper.element}, ${JSON.stringify(
          oper.name,
        )}, undefined, ${oper.value})\n`
        vaporHelpers.add('setAttr')
        break
      }

      case IRNodeTypes.SET_TEXT: {
        code = `setText(n${oper.element}, undefined, ${oper.value})\n`
        vaporHelpers.add('setText')
        break
      }

      case IRNodeTypes.SET_EVENT: {
        code = `on(n${oper.element}, ${JSON.stringify(oper.name)}, ${
          oper.value
        })\n`
        vaporHelpers.add('on')
        break
      }

      case IRNodeTypes.SET_HTML: {
        code = `setHtml(n${oper.element}, undefined, ${oper.value})\n`
        vaporHelpers.add('setHtml')
        break
      }

      case IRNodeTypes.CREATE_TEXT_NODE: {
        code = `const n${oper.id} = createTextNode(${oper.value})\n`
        vaporHelpers.add('createTextNode')
        break
      }

      case IRNodeTypes.INSERT_NODE: {
        const elements = ([] as number[]).concat(oper.element)
        let element = elements.map((el) => `n${el}`).join(', ')
        if (elements.length > 1) element = `[${element}]`
        code = `insert(${element}, n${oper.parent}${`, n${oper.anchor}`})\n`
        vaporHelpers.add('insert')
        break
      }
      case IRNodeTypes.PREPEND_NODE: {
        code = `prepend(n${oper.parent}, ${oper.elements
          .map((el) => `n${el}`)
          .join(', ')})\n`
        vaporHelpers.add('prepend')
        break
      }
      case IRNodeTypes.APPEND_NODE: {
        code = `append(n${oper.parent}, ${oper.elements
          .map((el) => `n${el}`)
          .join(', ')})\n`
        vaporHelpers.add('append')
        break
      }
      default:
        checkNever(oper)
    }

    return code
  }
}

/**
 * 遍历所有引用节点 children
 * child 的 key 是其在父节点中的顺序，child.placeholder/id 是引用节点编译时生成的 id
 * 通过 index 和 id 生成一个解构对象，在运行时通过解构获得引用节点
 * {
 *  0: [
 *      n1, {
 *          1: [n2],
 *        }
 *      ],
 *  2: [n3]
 * }
 * @param children
 */
function genChildren(children: DynamicChildren) {
  let code = ''
  // TODO
  let offset = 0
  for (const [index, child] of Object.entries(children)) {
    const childrenLength = Object.keys(child.children).length
    // 保存无须生成的节点的偏移量。无须生成是因为包含在上一次生成的代码中，连续的动态节点是批量插入的
    if (child.ghost && child.placeholder === null && childrenLength === 0) {
      offset--
      continue
    }

    // 拼接解构对象内容，index 是节点顺序
    code += ` ${Number(index) + offset}: [`

    // 拼接解构对象内容，id 是引用节点生成顺序
    // 当前节点如果是需要插入的动态节点，则取其关联的引用节点 placeholder
    const id = child.ghost ? child.placeholder : child.id
    if (id !== null) code += `n${id}`

    // 递归生成解构对象
    const childrenString = childrenLength && genChildren(child.children)
    if (childrenString) code += `, ${childrenString}`

    code += '],'
  }

  if (!code) return ''
  return `{${code}}`
}
