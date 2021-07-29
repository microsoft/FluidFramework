# @fluid-example/todo

**Todo** is a more advanced example that covers more complicated scenarios. The Todo app uses React as it's view rendering platform.

![Todo Example](./resources/todo-screen-capture.gif)

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- The getting started instructions are automatically generated.
To update them, edit docs/md-magic.config.js, then run 'npm run build:md-magic' -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/todo`
1. Run `npm run start` from this directory (examples/data-objects/todo) and open <http://localhost:8080> in a web browser to see the app running.
<!-- AUTO-GENERATED-CONTENT:END -->

## Todo Fluid Objects

There are two Fluid objects that make up the Todo application:

### [Todo](./src/Todo/index.tsx)

A Todo is the top level Fluid object and contains three core concepts:

1. Title
2. Ability to create new Todo Items
3. Collection of Todo Items

### [TodoItem](./src/TodoItem/index.tsx)

A Todo Item is a singular todo entry. Because each Todo Item is its own Fluid object each Todo Item can be independently opened.

Todo Items can contain one inner Fluid object. These can currently be another Todo Item or a Clicker.

## Other Fluid Objects

There are two other Fluid objects that live in the todo repo but are there to extend functionality of `TodoItem`

### [TextBox](./src/TextBox/index.tsx)

A Collaborative TextArea based off the React CollaborativeTextArea. This should be replaced by just pulling in the `@fluid-example/collaborative-textarea` Fluid objects.

### [TextList](./src/TextList/index.tsx)

Used the `SharedString` to manage a list of text items.
