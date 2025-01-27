# Vue Vapor

This repository is a fork of [vuejs/core](https://github.com/vuejs/core) and is used for research and development of no virtual dom mode.

## TODO

PR are welcome!

- [Issues with `todo` tag](https://github.com/vuejs/core-vapor/labels/todo)
- To-do list below (**create an issue** for discussion before a big feat/bug PR is required)
- `// TODO` comments in code (`compiler-vapor` and `runtime-vapor` packages)

---

- [x] Counter App
  - [x] simple bindings
  - [x] simple events
- [ ] TODO-MVC App
- [ ] Repl
- [x] transform
  - [x] NodeTransform
  - [x] DirectiveTransform
- [ ] directives
  - [x] `v-once`
  - [x] `v-html`
  - [x] `v-text`
  - [x] `v-pre`
  - [x] `v-cloak`
  - [x] `v-bind`
    - [x] simple expression
    - [x] compound expression
    - [ ] modifiers
      - [ ] .camel
      - [ ] .prop
      - [ ] .attr
  - [ ] `v-on`
    - [x] simple expression
    - [ ] compound expression
    - [x] modifiers
  - [ ] runtime directives
    - #19
  - [ ] `v-memo`
    - #18
  - [ ] `v-model`
    - #17
    - needs #19 first
  - [ ] `v-if` / `v-else` / `v-else-if`
    - #9
  - [ ] `v-for`
    - #21
  - [ ] `v-show`
    - #16
    - needs #19 first
- [x] Fragment
- [ ] Codegen
  - [x] CodegenContext
  - [x] indent
  - [x] Source map
  - [ ] Function mode
  - [ ] SSR
- [ ] Built-in Components
  - [ ] Transition
  - [ ] TransitionGroup
  - [ ] KeepAlive
  - [ ] Teleport
  - [ ] Suspense
- [ ] [Component](https://github.com/vuejs/core-vapor/issues/4)
- [ ] Performance & Optimization
  - [ ] remove unnecessary close tag `</div>`

## Sponsors

Vue.js is an MIT-licensed open source project with its ongoing development made possible entirely by the support of these awesome [backers](https://github.com/vuejs/core/blob/main/BACKERS.md). If you'd like to join them, please consider [ sponsoring Vue's development](https://vuejs.org/sponsor/).

<p align="center">
  <h3 align="center">Special Sponsor</h3>
</p>

<p align="center">
  <a target="_blank" href="https://github.com/appwrite/appwrite">
  <img alt="special sponsor appwrite" src="https://sponsors.vuejs.org/images/appwrite.svg" width="300">
  </a>
</p>

<p align="center">
  <a target="_blank" href="https://vuejs.org/sponsor/#current-sponsors">
    <img alt="sponsors" src="https://sponsors.vuejs.org/sponsors.svg?v3">
  </a>
</p>

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2013-present, Yuxi (Evan) You
