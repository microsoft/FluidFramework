---
title: Examples
menuPosition: 4
aliases:
  - "/docs/get-started/examples/"
  - "/start/examples/"
---

We've included several example apps in a [GitHub repository](https://github.com/microsoft/FluidExamples) to demonstrate
both the power and simplicity of Fluid. Use these to learn and kickstart your own projects.

## Brainstorming

![A screenshot of brainstorming app](/images/brainstorm-example.png)

The sticky notes [brainstorming app](https://github.com/microsoft/FluidExamples/tree/main/brainstorm)
shows how simple experiences become compelling when you make them collaborative. This example uses distributed
maps (SharedMaps) to update the state of sticky notes as well as keep track of who added which ideas and who
voted for those ideas.

## Collaborative text area

The [collaborative text area app](https://github.com/microsoft/FluidExamples/tree/main/collaborative-text-area) shows
how to create a text area that can be collaboratively edited by multiple clients. It uses React to create
the view. See also [Building a collaborative TextArea]({{< relref "docs/recipes/collaborative-text-area.md" >}}).

## Separating the view from the Fluid business logic

The [multiframework dice roller app](https://github.com/microsoft/FluidExamples/tree/main/multi-framework-diceroller)
shows you how to keep your view layer separate from your Fluid layer. By changing a single line
of code, you can switch between views based on React, Vue, Web Components, and simple, no framework
JavaScript. See also [Using Fluid with React]({{< relref "docs/recipes/react.md" >}}),
[Using Fluid with Vue]({{< relref "docs/recipes/vue.md" >}}),
and [Using Fluid with Web Components]({{< relref "docs/recipes/web-components.md" >}})

## Angular and Fluid

The [Angular timestamp app](https://github.com/microsoft/FluidExamples/tree/main/angular-demo) shows how clients
can share a timestamp. Use it as a starter template to build your own Fluid Framework application on the
Angular framework. See also [Using Fluid with Angular]({{< relref "docs/recipes/angular.md" >}}).

## React and Fluid

The [React dice app](https://github.com/microsoft/FluidExamples/tree/main/react-starter-template) shows how
to make incorporate Fluid state into a React-based app. Use it as a starter template to implement a 
React-based view for your own Fluid Framework application.

The [React timestamp app](https://github.com/microsoft/FluidExamples/tree/main/react-demo) shows how to integrate Fluid into an app created with the [create-react-app](https://create-react-app.dev/) tool. See also [Using Fluid with React]({{< relref "docs/recipes/react.md" >}}).

## Fluid with command line clients

The [NodeJS demo app](https://github.com/microsoft/FluidExamples/tree/main/node-demo) shows how clients
that don't have an HTTP canvas can participate in the Fluid Framework collaboration. See also
[Using Fluid with NodeJS]({{< relref "docs/recipes/node.md" >}}).

## Fluid in a Microsoft 365 Teams tab

The [Teams and Fluid "Hello World" app](https://github.com/microsoft/FluidExamples/tree/main/teams-fluid-hello-world)
shows you how to integrate a Fluid Framework application into a custom Microsoft 365 Teams tab. See
also [Using Fluid with Microsoft Teams](https://learn.microsoft.com/microsoftteams/platform/tabs/using-fluid-msteam).