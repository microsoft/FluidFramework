# Fluid Generator

Use this tool to quickly bootstrap a new Fluid Component package based of our example Dice Roller Fluid Component.

## Basic Getting Started

To get started ensure you have [Node.js](https://nodejs.org/en/) and [Git](https://git-scm.com/) installed, then install [Yeoman](https://yeoman.io/) and the [Fluid Component Generator](//TODO:Add-Link) with:

````bash
npm install -g yo @fluid-framework/fluid-generator
````

You're now setup to bootstrap a new Fluid component at any time. Run the generator and fill out a few prompts.

````bash
yo @fluid-framework/fluid-generator

# Congratulations! You've started building your own Fluid Component.
# Let us help you get set up. Once we're done, you can start coding!
# ? What the name of your component? helloworld
# ? Which view framework would you like to start with? (Use arrow keys)
# > react
#   vanillaJS

cd helloworld

npm start
````

---

## Directory Structure

When running the generator a new folder will be generated with the following contents:

```text
.
├── src
|   ├── component.ts(x)   // Fluid Component source code
|   ├── index.ts          // Export file
|   ├── model.ts          // Model Interface Definition
|   └── view.ts(x)        // View Logic
├── .gitignore            // Ignore dist and node_modules
├── package.json          // Package manifest
├── README.md             // Description of your component functionality
├── tsconfig.json         // TypeScript configuration
└── webpack.config.js     // Webpack configuration
```

## Advanced (Command Line)

```text
Usage:
    @fluid-framework/fluid-generator [<component name>] <options>

Arguments:
    [<component name>]     Name of the New Component

Options:
    -r --react             Choose react as default view
    -v --vanilla           Choose vanillaJS as default view
```
