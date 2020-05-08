# Todo

This is a simple Todo application that covers many of the core scenarios for building a Fluid Component. The Todo app uses React as it's view rendering platform.

[Live Example on wu2-ppe](https://www.wu2-ppe.prague.office-int.com/waterpark?chaincode=@fluid-example/todo@0.6.0)

![Todo Example](./resources/todo-screen-capture.gif)

## Components

There are two components that make up the Todo application:

## [Todo](./src/Todo/index.tsx)

A Todo is the top level component and contains three core concepts:

1. Title
2. Ability to create new Todo Items
3. Collection of Todo Items

## [TodoItem](./src/TodoItem/index.tsx)

A Todo Item is a singular todo entry. Because each Todo Item is its own component each Todo Item can be independently opened.

Todo Items can contain one inner component. These can currently be another Todo Item or a Clicker.

## Getting Started with Development

To start coding, open this directory in your IDE and check out ./src/index.tsx

You can try the following commands

```node
    npm start
       Hosts the component at http://localhost:8080


    npm run build
       Builds the component into bundled js files


    npm run deploy
       Publishes the chaincode to https://packages.wu2.prague.office-int.com/#/
```

We suggest you start by typing:

```node
npm start
```

## npm or Azure DevOps auth Issue

[Stack Overflow Issue](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

If you run into an auth issue. Please set up your .npmrc. This is a common issue during npm install.

For windows: https://www.npmjs.com/package/vsts-npm-auth

For mac you’ll need to add credentials to your npmrc manually. Go to this link, https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=prague, click on “Connect to Feed” then select **npm** on the left, and follow the instructions.
