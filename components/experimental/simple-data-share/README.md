# Simple Data Sharing Component Example

This is a simple example of how to share data across components using the Query Interface. This example takes our basic Counter example and breaks it into multiple components that share the same underlying data. The example is definitely a bit excessive for the simple counter component but it represents how easy it is to break up something simple into parts.

In this example we have four different components.

## [`SimpleDataSharing`](./src/index.tsx)

This is our core component. It does a few specific things:

1. It is the only component that has Fluid state.
2. It crates the counter DDS.
3. It calls create and attach on other three components.
4. It initializes the Container Runtime.
5. It loads all of the other components.

## [`Button`](./src/localChaincode/Button.tsx)

`Button` doesn't manage or display and Fluid state but updates that state on a trigger.

1. Creates a button in the provided div.
2. Increments the counter object on click.

## [`Incrementor`](./src/localChaincode/Incrementor.tsx)

`Incrementor` doesn't manage or have any UI. It simply set's a timer that will update the state of the provided counter. Adding this logic into its own component can be valuable when you need to reuse this logic with multiple other components. It reduces duplication.

1. Create a timer to randomly increment the counter every 5 seconds.

## [`TextDisplay`](./src/localChaincode/TextDisplay.tsx)

`TextDisplay` doesn't modify state but only displays changes.

1. Displays the counter value in a div.
2. Sets a listener on the counter to update on changes.

# Running the code

````
    npm start
       Hosts the component at http://localhost:8080


    npm run build
       Builds the component into bundled js files
````

## npm or Azure DevOps auth Issue

[Stack Overflow Issue](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

If you run into an auth issue. Please set up your .npmrc. This is a common issue during npm install.

For windows: https://www.npmjs.com/package/vsts-npm-auth

For mac you’ll need to add credentials to your npmrc manually. Go to this link, https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=prague, click on “Connect to Feed” then select **npm** on the left, and follow the instructions.


