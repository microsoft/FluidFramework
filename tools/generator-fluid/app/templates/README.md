# A Fluid Component Appeared...

This project was bootstrapped with the [yo-fluid generator](...)

## Getting Started

### Running your Fluid Component

To start testing run the following:

```bash
    npm start
```

### Code Structure

All the code logic lives within the `./src` folder. There are 4 files that makeup a basic component.

The important thing to note is that the Fluid component represents the data model which is separated out from our view via an interface. This separation allows us to build view agnostic, reusable, and scalable Fluid component objects.

#### `./src/component<%= extension %>`

The `component<%= extension %>` file contains the Fluid component and the logic for our data model.

#### `./src/index.ts`

The `index.ts` file is not very interesting and simply defines our exports. We are exporting two things:

**The Fluid component itself** which allows other packages to consume the Fluid component object directly.

**The `fluidExport`** which points to our Fluid component factory is used for dynamic Fluid component loading. Our `webpack-component-loader` uses this to find the Fluid component entry point when running `npm start`.

#### `./src/interface.ts`

The `interface.ts` file defines the interface between our Fluid component and our view. This abstraction is important to ensure we are building reusable and scalable components.

#### `./src/view<%= extension %>`

The `view<%= extension %>` file contains all the view logic.

### Directory Anatomy

```text
.
├── src
|   ├── component<%= extension %>    // Fluid Component source code
|   ├── index.ts          // Export file
|   ├── interface.ts      // Model Interface Definition
|   └── view<%= extension %>         // View Logic
├── .gitignore            // Ignore dist and node_modules
├── package.json          // Package manifest
├── README.md             // Description of your component's functionality
├── tsconfig.json         // TypeScript configuration
└── webpack.config.js     // Webpack configuration
```

## Available Scripts

Below are the following available scripts. They can be run from the project root with the following command:

```bash
npm run [script-name]
```

### `build`

Runs [`tsc`](###-tsc) and [`webpack`](###-webpack) and outputs the results in `./dist`.

### `start`

A shortcut cmd from `start:local`

### `start:local`

Uses `webpack-dev-server` to start a local webserver that will host your webpack file.

Once you run `start:local` you can navigate to `http://localhost:8080` in any browser window to test your fluid example.

Uses [sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) and an in memory Fluid Server implementation to allow for fluid collaboration within a Tab instance.

### `start:tiny`

> Requires `tinylicious` Fluid server running locally at `http://localhost:3000`.

Uses `webpack-dev-server` to start a local webserver that will host your webpack file.

Once you run `start:local` you can navigate to `http://localhost:8080` in any browser window to test your fluid example.

`tinylicious` is a Fluid server implementation that runs locally and
allows for cross browser/tab testing. To learn more about `tinylicious` go to `TODO://ADD LINK`

### `tsc`

Compiles the TypeScript code. Output is written to the ./dist folder.

### `webpack`

Compiles and webpacks the TypeScript code. Output is written to the ./dist folder.
