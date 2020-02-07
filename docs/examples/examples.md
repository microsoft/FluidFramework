---
uid: examples
---

# Examples

You can find a number of examples in the Fluid repo, under the
[examples/components](https://github.com/Microsoft/FluidFramework/tree/master/examples/components)
path. The following is a list of good examples to start with.

Also see the [sudoku tutorial](./sudoku.md) and [the yo fluid breakdown](./yo-fluid-breakdown.md).


## Diceroller

[Source code](https://github.com/Microsoft/FluidFramework/tree/release/0.13/packages/components/dice-roller)

**Complexity:** Simple

**UI library:** React

**Distributed data structures:**

- SharedDirectory

Diceroller is a simple example to familiarize yourself with Fluid's component scaffolding. It uses React for rendering.

<style>
  iframe#diceroller {
    height: 95px;
    width: 200px;
  }
</style>

<iframe id="diceroller" src="/fluid/diceroller.html"></iframe>


## Badge

[Source code](https://github.com/Microsoft/FluidFramework/tree/release/0.13/examples/components/badge)

**Complexity:** Intermediate

**UI library:** React

**Distributed data structures:**

- SharedMap
- SharedObjectSequence

<style>
  iframe#badge {
    height: 400px;
    width: 800px;
  }
</style>

<iframe id="badge" src="/fluid/badge.html"></iframe>


## Todo

[Source code](https://github.com/Microsoft/FluidFramework/tree/release/0.13/packages/components/todo)

**Complexity:** Intermediate

**UI library:** React

**Distributed data structures:**

- SharedMap
- SharedString
- SharedCell

Todo demonstrates subcomponents and using Fluid's routing capabilities to enable an individual todo item to be embedded
in a different canvas.

<style>
  iframe#todo {
    height: 400px;
    width: 800px;
  }
</style>

<iframe id="todo" src="/fluid/todo.html"></iframe>
