# Fluid Generator

Use this tool to quickly bootstrap a new Fluid component package based on the example [Dice Roller](//TODO:Add-Link) Fluid component.

## Basic Getting Started

To get started ensure you have [Node.js](https://nodejs.org/en/) and [Git](https://git-scm.com/) installed, then install [Yeoman](https://yeoman.io/) and the [Fluid Component Generator](//TODO:Add-Link) with:

````bash
npm install -g yo @microsoft/fluid
````

You're now set up to bootstrap a new Fluid component at any time. Run the generator and fill out a few prompts.

````bash
yo @microsoft/fluid

# Congratulations! You've started building your own Fluid Component.
# Let us help you get set up. Once we're done, you can start coding!
# ? What the name of your new component? helloworld
# ? Which view framework would you like to start with? (Use arrow keys) react
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
|   ├── interface.ts      // Model Interface Definition
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
  yo @microsoft/fluid [<componentName>] [options]

Options:
  -h,    --help           # Print the generator's options and usage
         --skip-cache     # Do not remember prompt answers               Default: false
         --skip-install   # Do not automatically install dependencies    Default: false
         --force-install  # Fail on install dependencies error           Default: false
         --ask-answered   # Show prompts for already configured options  Default: false
  -r,    --react          # Sets React as Default View
  -v,    --vanilla        # Sets VanillaJS as Default View

Arguments:
  componentName  # Defines the Component Name  Type: String  Required: false
```
