import { render } from 'vue/vapor'

const modules = import.meta.glob<any>('./*.vue')
const mod = (modules['.' + location.pathname] || modules['./App.vue'])()

mod.then(({ default: m }) => {
  render(() => {
    const returned = m.setup?.({}, { expose() {} })
    return m.render(returned) // vue 文件编译成 render 函数，执行之后返回一个 DOM 节点
  }, '#app')
})
