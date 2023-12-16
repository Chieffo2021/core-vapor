import type { SourceLocation } from '@vue/compiler-dom'

export const enum IRNodeTypes {
  ROOT,
  TEMPLATE_FACTORY,
  FRAGMENT_FACTORY,

  SET_PROP,
  SET_TEXT,
  SET_EVENT,
  SET_HTML,

  INSERT_NODE,
  PREPEND_NODE,
  APPEND_NODE,
  CREATE_TEXT_NODE,
}

export interface IRNode {
  type: IRNodeTypes
  loc: SourceLocation // 源码位置
}

export interface RootIRNode extends IRNode {
  type: IRNodeTypes.ROOT // 节点类型
  template: Array<TemplateFactoryIRNode | FragmentFactoryIRNode> // 静态节点内容
  dynamic: DynamicInfo // 动态节点内容
  // TODO multi-expression effect
  effect: Record<string /* expr */, OperationNode[]> // 保存响应式内容更新操作
  operation: OperationNode[] // 保存添加/更新动态节点操作
  helpers: Set<string> // 保存需要从 vue 中导入的模块名
  vaporHelpers: Set<string> // 保存需要从 vue-vapor 中导入的模块名
}

export interface TemplateFactoryIRNode extends IRNode {
  type: IRNodeTypes.TEMPLATE_FACTORY
  template: string
}

export interface FragmentFactoryIRNode extends IRNode {
  type: IRNodeTypes.FRAGMENT_FACTORY
}

export interface SetPropIRNode extends IRNode {
  type: IRNodeTypes.SET_PROP
  element: number
  name: string
  value: string
}

export interface SetTextIRNode extends IRNode {
  type: IRNodeTypes.SET_TEXT
  element: number // 引用节点的 id
  value: string
}

export interface SetEventIRNode extends IRNode {
  type: IRNodeTypes.SET_EVENT
  element: number
  name: string
  value: string
}

export interface SetHtmlIRNode extends IRNode {
  type: IRNodeTypes.SET_HTML
  element: number
  value: string
}

export interface CreateTextNodeIRNode extends IRNode {
  type: IRNodeTypes.CREATE_TEXT_NODE
  id: number
  value: string
}

export interface InsertNodeIRNode extends IRNode {
  type: IRNodeTypes.INSERT_NODE
  element: number | number[]
  parent: number
  anchor: number
}

export interface PrependNodeIRNode extends IRNode {
  type: IRNodeTypes.PREPEND_NODE
  elements: number[]
  parent: number
}

export interface AppendNodeIRNode extends IRNode {
  type: IRNodeTypes.APPEND_NODE
  elements: number[]
  parent: number
}

export type OperationNode =
  | SetPropIRNode
  | SetTextIRNode
  | SetEventIRNode
  | SetHtmlIRNode
  | CreateTextNodeIRNode
  | InsertNodeIRNode
  | PrependNodeIRNode
  | AppendNodeIRNode

export interface DynamicInfo {
  // 引用节点 id，通过 globalId 生成，每增加一个引用节点 +1
  // 引用节点包括
  // 1. 新创建的动态节点
  // 2. 原静态节点，关联了添加/更新动态节点操作
  // 3. 原静态节点，关联了响应式更新操作
  id: number | null
  referenced: boolean // 是否存在引用节点
  /** created by DOM API */
  ghost: boolean // 需要新增的动态节点
  placeholder: number | null // 连续的动态节点中的第一个节点持有 placeholder，关联引用节点 id
  children: DynamicChildren // 引用节点集合，key-value 形式，key 是节点在父元素中的顺序，即：index
}
export type DynamicChildren = Record<number, DynamicInfo>
