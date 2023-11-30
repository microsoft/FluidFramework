# @fluid-example/shared-tree-demo

This app demonstrates how to create a simple tree data structure and build a React app using that data.

## Setting up the Fluid Framework

This app is designed to use
[Azure Fluid Relay](https://aka.ms/azurefluidrelay) a Fluid relay service offered by Microsoft. You can also run a local service for development purposes. Instructions on how to set up a Fluid relay are on the [Fluid Framework website](aka.ms/fluid).

One important note is that you will need to use a token provider or, purely for testing and development, use the insecure token provider. There are instructions on how to set this up on the [Fluid Framework website](aka.ms/fluid).

All the code required to set up the Fluid Framework and SharedTree data structure is in the fluid.ts source file. Most of this code will be the same for any app. However, because SharedTree is still in the alpha stage, the code to set it up isn't optimized yet.

One thing of particular interest is the inclusion of the useTree React hook in fluid.ts. This custom hook makes building the user interface very intuitive as it allows the developer to use typed tree data to build the UI and it ensures that any changes trigger an update to the React app.

## Schema Definition

The SharedTree schema is defined in the schema.ts source file. This schema is passed into the SharedTree when it is initialized in index.tsx. For more details, see the schema.ts comments.

## Working with Data

Working with data in the SharedTree is very simple; however, working with distributed data is always a little more complicated than working with local data. To isolate this complexity, this app uses a set of helper functions in the helpers.ts source file that take types defined in the schema as input and modify the data in some way. Each function includes a brief description of how it works.

## User Interface

This app is built using React. It uses a custom hook to fetch the data from the SharedTree and automatically keep it up to date. Changes to the data are handled using the helper functions mentioned above. If you look at the code in ux.tsx, you'll find very little code that is unique to an app built with the Fluid Framework.
