# generator-fluid

Use this tool to quickly bootstrap a new Fluid component package based on the example [Dice Roller](//TODO:Add-Link) Fluid component.

The generator can bootstrap with a beginner or advanced scaf

## Basic Getting Started

To get started ensure you have [Node.js](https://nodejs.org/en/) and [Git](https://git-scm.com/) installed, then install [Yeoman](https://yeoman.io/) and the [Fluid Component Generator](https://www.npmjs.com/package/generator-fluid) with:

````bash
npm install -g yo generator-fluid
````

You're now set up to bootstrap a new Fluid component at any time. Run the generator and fill out a few prompts.

````bash
yo fluid

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

There are two types of structure outputs depending on your scaffolding choice.

### Beginner Scaffolding

Use beginner scaffolding if you are new to the Fluid Framework, are looking to prototype, or are unfamiliar with
existing web technologies.

```text
.
├── src
|   ├── component.ts(x)            // Fluid Component source code with view
|   └── index.ts                   // Export file
├── .gitignore                     // Ignore dist and node_modules
├── jest-puppeteer.config.js       // jest-puppeteer configuration
├── jest.config.js                 // Jest configuration
├── package.json                   // Package manifest
├── README.md                      // Description of your component's functionality
├── tsconfig.json                  // TypeScript configuration
└── webpack.config.js              // Webpack configuration
```

### Advanced Scaffolding

Use advanced scaffolding if you have a strong understanding of TypeScript and are looking to build a Fluid component that will scale.

```text
.
├── src
|   ├── component.ts(x)            // Fluid Component source code
|   ├── index.ts                   // Export file
|   ├── interface.ts               // Model Interface Definition
|   └── view.ts(x)                 // View Logic
├── .gitignore                     // Ignore dist and node_modules
├── jest-puppeteer.config.js       // jest-puppeteer configuration
├── jest.config.js                 // Jest configuration
├── package.json                   // Package manifest
├── README.md                      // Description of your component's functionality
├── tsconfig.json                  // TypeScript configuration
└── webpack.config.js              // Webpack configuration
```

## Command Line

```text
Usage:
  yo fluid [<componentName>] [options]

Options:
  -h,   --help           # Print the generator's options and usage
        --skip-cache     # Do not remember prompt answers               Default: false
        --skip-install   # Do not automatically install dependencies    Default: false
        --force-install  # Fail on install dependencies error           Default: false
        --ask-answered   # Show prompts for already configured options  Default: false
        --view-react     # Sets React as Default View
        --view-none      # Sets None as Default View
        --beginner       # Sets beginner as scaffolding
        --advanced       # Sets advanced as scaffolding

Arguments:
  componentName  # Defines the Component Name  Type: String  Required: false
```
