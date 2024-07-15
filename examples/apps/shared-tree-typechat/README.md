# Shared Tree Demo

This app demonstrates how to create a simple tree data structure and build a React app using that data.

## Setting up the Fluid Framework

This app is designed to use
[Azure Fluid Relay](https://aka.ms/azurefluidrelay) a Fluid relay service offered by Microsoft. You can also run a local service for development purposes. Instructions on how to set up a Fluid relay are on the [Fluid Framework website](https://aka.ms/fluid).

To use AzureClient's local mode, you first need to start a local server.

```bash
npm run start:server
```

Running this command from your terminal window will launch the Azure Fluid Relay local server. Once the server is started, you can run your application against the local service.

```bash
npm run start
```

One important note is that you will need to use a token provider or, purely for testing and development, use the insecure token provider. There are instructions on how to set this up on the [Fluid Framework website](https://aka.ms/fluid).

All the code required to set up the Fluid Framework and SharedTree data structure is in the infra folder. Most of this code will be the same for any app.

## Schema Definition

The SharedTree schema is defined in the \_schema.ts source files. This schema is passed into the SharedTree when it is initialized in index.tsx. For more details, see the schema.ts comments.

## Working with Data

Working with data in the SharedTree is very simple; however, working with distributed data is always a little more complicated than working with local data. To isolate this complexity, this app uses a set of helper functions in the \_helpers.ts source files and in the schema itself that take types defined in the schema as input and modify the data in some way. Each function includes a brief description of how it works.

One important note about managing local state and events: ideally, in any app you write, it is best to not
special case local changes. Treat the SharedTree as your local data and rely on tree events to update your view. This makes the code reliable and easy to maintain. Also, never mutate tree nodes within events listeners.

## User Interface

This app is built using React. Changes to the data are handled using the helper functions mentioned above. If you look at the code in \*ux.tsx files, you'll find very little code that is unique to an app built with the Fluid Framework. If you want to change the css you must run 'npx tailwindcss -i ./src/index.css -o ./src/output.css --watch' in the root folder of your project so that tailwind can update the output.css file.

## Building and Running

You can use the following npm scripts (`npm run SCRIPT-NAME`) to build and run the app.

<!-- AUTO-GENERATED-CONTENT:START (SCRIPTS) -->

| Script      | Description                                                                           |
| ----------- | ------------------------------------------------------------------------------------- |
| `build`     | `npm run format && npm run webpack`                                                   |
| `compile`   | Compile the TypeScript source code to JavaScript.                                     |
| `dev`       | Runs the app in webpack-dev-server. Expects local-azure-service running on port 7070. |
| `dev:azure` | Runs the app in webpack-dev-server using the Azure Fluid Relay config.                |
| `format`    | Format source code using Prettier.                                                    |
| `lint`      | Lint source code using ESLint                                                         |
| `webpack`   | `webpack`                                                                             |
| `start`     | `npm run dev`                                                                         |

<!-- AUTO-GENERATED-CONTENT:END -->
