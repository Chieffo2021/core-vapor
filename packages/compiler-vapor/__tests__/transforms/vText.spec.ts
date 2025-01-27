import {
  BindingTypes,
  DOMErrorCodes,
  NodeTypes,
  parse,
} from '@vue/compiler-dom'
import {
  type CompilerOptions,
  compile as _compile,
  RootIRNode,
  transform,
  generate,
  IRNodeTypes,
} from '../../src'
import { getBaseTransformPreset } from '../../src/compile'

function compileWithVText(
  template: string,
  options: CompilerOptions = {},
): {
  ir: RootIRNode
  code: string
} {
  const ast = parse(template, { prefixIdentifiers: true, ...options })
  const [nodeTransforms, directiveTransforms] = getBaseTransformPreset(true)
  const ir = transform(ast, {
    nodeTransforms,
    directiveTransforms,
    prefixIdentifiers: true,
    ...options,
  })
  const { code } = generate(ir, { prefixIdentifiers: true, ...options })
  return { ir, code }
}

describe('v-text', () => {
  test('should convert v-text to textContent', () => {
    const { code, ir } = compileWithVText(`<div v-text="str"></div>`, {
      bindingMetadata: {
        str: BindingTypes.SETUP_REF,
      },
    })

    expect(ir.vaporHelpers).contains('setText')
    expect(ir.helpers.size).toBe(0)

    expect(ir.operation).toEqual([])

    expect(ir.effect).toMatchObject([
      {
        expressions: [
          {
            type: NodeTypes.SIMPLE_EXPRESSION,
            content: 'str',
            isStatic: false,
          },
        ],
        operations: [
          {
            type: IRNodeTypes.SET_TEXT,
            element: 1,
            value: {
              type: NodeTypes.SIMPLE_EXPRESSION,
              content: 'str',
              isStatic: false,
            },
          },
        ],
      },
    ])

    expect(code).matchSnapshot()
  })

  test('should raise error and ignore children when v-text is present', () => {
    const onError = vi.fn()
    const { code, ir } = compileWithVText(`<div v-text="test">hello</div>`, {
      onError,
    })
    expect(onError.mock.calls).toMatchObject([
      [{ code: DOMErrorCodes.X_V_TEXT_WITH_CHILDREN }],
    ])

    // children should have been removed
    expect(ir.template).toMatchObject([{ template: '<div></div>' }])

    expect(ir.effect).toMatchObject([
      {
        expressions: [
          {
            type: NodeTypes.SIMPLE_EXPRESSION,
            content: 'test',
            isStatic: false,
          },
        ],
        operations: [
          {
            type: IRNodeTypes.SET_TEXT,
            element: 1,
            value: {
              type: NodeTypes.SIMPLE_EXPRESSION,
              content: 'test',
              isStatic: false,
            },
          },
        ],
      },
    ])

    expect(code).matchSnapshot()
    // children should have been removed
    expect(code).contains('template("<div></div>")')
  })

  test('should raise error if has no expression', () => {
    const onError = vi.fn()
    const { code } = compileWithVText(`<div v-text></div>`, { onError })
    expect(code).matchSnapshot()
    expect(onError.mock.calls).toMatchObject([
      [{ code: DOMErrorCodes.X_V_TEXT_NO_EXPRESSION }],
    ])
  })
})
