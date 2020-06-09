# Hello World - the Dice Roller

The Dice roller is a fully-functional Fluid component; its code looks like this:

<<< @/tutorials/dice-roller.tsx

It displays a die and a button to roll it. You can try it below.

---

**Try the Dice roller [Doesn't work yet]**

<style>
  iframe#diceroller {
    height: 95px;
    width: 200px;
  }
</style>

<iframe id="diceroller" src="/fluid/diceroller.html"></iframe>

---

## How to read this guide

In this guide, we will examine the building blocks of the Fluid Framework: distributed data structures and components.
Once you master them, you can create complex collaborative applications with fast, eventually consistent distributed
state.

Every section in this guide builds on the knowledge introduced in earlier sections. You can learn most of Fluid
Framework by reading the sections in the guide in the order they appear in the sidebar. For example, "Introducing
distributed data structures" is the next section after this one.

::: tip

This guide is designed to **introduce you to Fluid Framework concepts from the ground up.** If you prefer to learn
by doing, check out [our tutorials](../tutorials/README.md). You might find the tutorials and the guide complementary to
each other.

:::

## Knowledge Level Assumptions

React is a TypeScript/JavaScript library, and so we'll assume you have a basic understanding of the JavaScript language.
If you don't feel very confident, we recommend going through [a JavaScript tutorial][mdn-tutorial] to check your
knowledge level and enable you to follow along this guide without getting lost. It might take you between 30 minutes and
an hour, but as a result you won't have to feel like you're learning both Fluid Framework and JavaScript at the same
time.

The [TypeScript handbook][ts-handbook] is another good resource.


::: tip

This guide uses some newer JavaScript syntax in the examples. If you haven't worked with JavaScript in the last few
years, [these three points](https://gist.github.com/gaearon/683e676101005de0add59e8bb345340c) should get you most of the
way.

:::


## Let's get started!

You can start with the [next section of the guide](dds.md) right now!


<!-- Links -->

[mdn-tutorial]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/A_re-introduction_to_JavaScript
[ts-handbook]: https://www.staging-typescript.org/docs/handbook/intro.html
