/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
var chalk = require("chalk");

const none = "none";
const react = "react";
const scaffoldingBeginner = "beginner";
const scaffoldingAdvanced = "advanced";

/**
 * Takes the user inputted component name, converts it to camelCase,
 * and removes any non-word characters (equal to [^a-zA-Z0-9_])
 */
function processComponentNameInput(nameArray) {
  const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  return nameArray
    .map((value, index) => {
      return index === 0 ? value : capitalize(value);
    })
    .join()
    .replace(/\W/g, "");
}

const questions = {
    componentName: {
        type: "input",
        name: "componentName",
        message: "What is the name of your new component?",
        filter: (input) => {
          return processComponentNameInput(input.split(" "));
        },
    },
    viewFramework : {
        type: "list",
        name: "viewFramework",
        message: "Which view framework would you like to start with?",
        default: react,
        choices: [react, none],
    },
    scaffolding: {
      type: "list",
      name: "scaffolding",
      message: "Which type of scaffolding would you like?",
      default: scaffoldingBeginner,
      choices: [scaffoldingBeginner, scaffoldingAdvanced],
    }
};

/**
 * Go to the Yeoman Website to find out more about their generators in general.
 *
 * All functions **without** a _ to start are run sequentially from the start to end of the document.
 * Functions **with** a _ can be called as helper functions.
 */
module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Adding two options to specify the view inline
    this.option(
      "view-react",
      {
        description: "Sets React as Default View",
      });
    this.option(
      "view-none",
      {
        description: "Sets None as Default View",
      });

    // Adding two options to specify the scaffolding inline
    this.option(
      scaffoldingBeginner,
      {
        description: `Sets ${scaffoldingBeginner} as scaffolding`,
      });
    this.option(
      scaffoldingAdvanced,
      {
        description: `Sets ${scaffoldingAdvanced} as scaffolding`,
      });

    // Adding argument to specify the component name inline
    this.argument(
      "componentName",
      {
        type: Array,
        required: false,
        description: "Defines the Component Name"
      });

    if (this.options["componentName"]) {
      // if there is a componentName option we need to strip out non-word characters
      this.options["componentName"] = processComponentNameInput(this.options["componentName"]);
    }
  }

  async prompting() {
    this.log("Congratulations! You've started building your own Fluid Component.");
    this.log("Let us help you get set up. Once we're done, you can start coding!");
    const questionsCollection = [];
    if (this.options.componentName) {
      this.log(`${chalk.green("?")} ${questions.componentName.message} ${chalk.blue(this._componentName())}`)
    } else {
      questionsCollection.push(questions.componentName);
    }

    if (this.options["view-react"] && this.options["view-none"]) {
      this.log(chalk.red("Both --view-react and --view-none options have been included. Prompting question."));
      delete this.options["view-react"];
      delete this.options["view-none"];
    }

    if (this.options["view-react"] || this.options["view-none"]) {
      this.log(`${chalk.green("?")} ${questions.viewFramework.message} ${chalk.blue(this._isReact() ? react : none)}`)
    } else {
      questionsCollection.push(questions.viewFramework);
    }

    if (this.options[scaffoldingBeginner] && this.options[scaffoldingAdvanced]) {
      this.log(chalk.red(`Both --${scaffoldingBeginner} and --${scaffoldingAdvanced} options have been included. Prompting question.`));
      delete this.options[scaffoldingBeginner];
      delete this.options[scaffoldingAdvanced];
    }

    if (this.options[scaffoldingBeginner] || this.options[scaffoldingAdvanced]) {
      this.log(`${chalk.green("?")} ${questions.scaffolding.message} ${chalk.blue(this._isBeginnerScaffolding ? scaffoldingBeginner : scaffoldingAdvanced)}`)
    } else {
      questionsCollection.push(questions.scaffolding);
    }

    if (questionsCollection) {
      this.answers = await this.prompt(questionsCollection);
    }

    this.destinationRoot(this._componentPkgName());
  }

  moveAndModifyTemplateFiles() {

    if (this._isBeginnerScaffolding()) {
      this._copyAndModifySimpleComponentFile();
      this.fs.copyTpl(
        this.templatePath("README-Simple.md"), // FROM
        this.destinationPath("./README.md"), // TO Root Folder,
        { extension: this._getFileExtension() },
      );
    } else {
      // Copy and Modify Advanced Files
      this._copyAndModifyComponentFile();
      this._copyAndModifyInterfaceFile();
      this._copyAndModifyViewFile();
      this.fs.copyTpl(
        this.templatePath("README.md"), // FROM
        this.destinationPath("./README.md"), // TO Root Folder,
        { extension: this._getFileExtension() },
      );
    }

    this._copyAndModifyPackageJsonFile();
    this._copyAndModifyIndexFile();
    this._copyAndModifyTsconfigFile();

    this.fs.copy(
      this.templatePath("tests/diceRoller.test.ts"), // FROM
      this.destinationPath(`tests/${this._componentPkgName()}.test.ts`), // TO Root Folder
    );

    // Copy Remaining Files
    this.fs.copy(
      this.templatePath("webpack.config.js"), // FROM
      this.destinationPath("./webpack.config.js"), // TO Root Folder
    );

    this.fs.copy(
      this.templatePath("jest-puppeteer.config.js"), // FROM
      this.destinationPath("jest-puppeteer.config.js"), // TO Root Folder
    );

    this.fs.copy(
      this.templatePath("jest.config.js"), // FROM
      this.destinationPath("jest.config.js"), // TO Root Folder
    );

    // Copy files that start with . from the root
    this.fs.copy(
      this.templatePath(".*"), // FROM
      this.destinationPath("./"), // TO Root Folder
    );
  }

  /**
   * Copy over the package.json file
   */
  _copyAndModifyPackageJsonFile() {
    var packageJson = this.fs.readJSON(this.templatePath("package.json"));
    packageJson.name = this._componentPkgName();

    if (!this._isReact()) {
      // REMOVE react-specific dependencies. This is preferred because it keeps all dependencies in one place
      delete packageJson.devDependencies["@types/react-dom"];
      delete packageJson.dependencies["react"];
      delete packageJson.dependencies["react-dom"];
    }

    this.fs.writeJSON(
      this.destinationPath("package.json"), // TO
      packageJson, // contents
    );
  }

  _copyAndModifySimpleComponentFile() {
    const file = this._generateNewProjectFile(
      `src/component-simple${this._getFileExtension()}`,
      `src/component${this._getFileExtension()}`);
    const classObj = file.getClass("DiceRoller");
    // Rename the class name with the component name provided
    classObj.rename(this._componentClassName());

    // Replace ComponentName response with package name
    const accessor = classObj.getGetAccessor("ComponentName");
    accessor.setBodyText(`return "${this._componentPkgName()}";`);

    if(this._isReact()) {
      const viewClassObj = file.getClass("DiceRollerView");
      viewClassObj.rename(`${this._componentClassName()}View`);
    }

    file.save();
  }

  _copyAndModifyComponentFile() {
    const file = this._generateNewProjectFile(`src/component${this._getFileExtension()}`);
    const classObj = file.getClass("DiceRoller");
    // Rename the class name with the component name provided
    classObj.rename(this._componentClassName());

    // Replace ComponentName response with package name
    const accessor = classObj.getGetAccessor("ComponentName");
    accessor.setBodyText(`return "${this._componentPkgName()}";`);

    // Rename interface name to match new component name
    const imports = file.getImportDeclaration("./interface");
    const interfaceImport = imports.getNamedImports()[0];
    interfaceImport.setName(this._componentInterfaceModelName());

    classObj.removeImplements(0);
    classObj.insertImplements(0, this._componentInterfaceModelName());

    file.save();
  }

  _copyAndModifyIndexFile() {
    const file = this._generateNewProjectFile("src/index.ts");

    // Update the component name on import
    const imports = file.getImportDeclaration("./component");
    const componentImport = imports.getNamedImports()[0];
    componentImport.setName(this._componentClassName());

    // Update the component name on export
    const exportDeclaration = file.getExportDeclaration(d => d.hasNamedExports());
    const namedExport = exportDeclaration.getNamedExports()[0];
    namedExport.setName(this._componentClassName());

    // Update the usage of the component name
    const variableStatement = file.getVariableStatement("fluidExport");
    const varDec = variableStatement.getDeclarations()[0];
    const initializer = `new ContainerRuntimeFactoryWithDefaultDataStore(
        ${this._componentClassName()}.factory.type,
        [
            ${this._componentClassName()}.factory,
            // Add another component here to create it within the container
        ])`
    varDec.set({initializer});

    // Formatting is needed for this file because the above initializer set won't set the indent correctly
    file.formatText({
        ensureNewLineAtEndOfFile: true,
        indentSize: 4,
    });

    file.save();
  }

  _copyAndModifyInterfaceFile() {
    const file = this._generateNewProjectFile("src/interface.ts");

    // Update interface name
    const modelInterface = file.getInterface("IDiceRoller");
    modelInterface.rename(this._componentInterfaceModelName())

    file.save();
  }

  _copyAndModifyViewFile() {
    const file = this._generateNewProjectFile(`src/view${this._getFileExtension()}`);

    // Rename model interface name to match new component name
    const imports = file.getImportDeclaration("./interface");
    const interfaceImport = imports.getNamedImports()[0];
    interfaceImport.setName(this._componentInterfaceModelName());

    if (this._isReact()) {
      // For react we need to update our interface name on the model
      const propsInterface = file.getInterface("IDiceRollerViewProps");
      const modelProp = propsInterface.getProperty("model");
      modelProp.setType(this._componentInterfaceModelName());
    } else {
      // For vanillaJS we need to update the constructor param type
      const ctor = file.getClass("DiceRollerView").getConstructors()[0];
      const param = ctor.getParameter("model");
      param.setType(this._componentInterfaceModelName());
    }

    file.save();
  }

  _copyAndModifyTsconfigFile() {
    var tsconfigJson = this.fs.readJSON(this.templatePath("tsconfig.json"));

    if (!this._isReact()) {
      // REMOVE react-specific dependencies. This is preferred because it keeps all dependencies in one place
      delete tsconfigJson.compilerOptions.jsx;
      tsconfigJson.compilerOptions.types = tsconfigJson.compilerOptions.types.slice(2)
    }

    this.fs.writeJSON(
      this.destinationPath("tsconfig.json"), // TO
      tsconfigJson, // contents
    );
  }

  _copyContainer() {
    const fileString = this.fs.read(this.templatePath("src/index.ts"));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath("src/index.ts"),
      fileString,
    );

    // Change class name plus references
    const componentDec = file.getImportDeclaration((dec) => {
      return dec.isModuleSpecifierRelative();
    });

    const importSpecifier = componentDec.addNamedImport(this._componentFactoryClassName());
    importSpecifier.setAlias("ComponentInstantiationFactory");

    file.save();
  }

  install() {
    this.log("Installing dependencies. This may take a minute.");
    this.npmInstall();
  }

  /**
   * Give Final Instructions to user
   */
  async end() {
    this.log("\n");
    this.log(chalk.green("Success.") + " Created component", this._componentName());
    this.log("Component is in", this.destinationRoot());
    this.log("\n");
    this.log("You can try the following commands");
    this.log("\n");

    this.log(chalk.cyan("    npm start"));
    this.log("       Hosts the component at http://localhost:8080");
    this.log("\n");

    this.log(chalk.cyan("    npm run build"));
    this.log("       Builds the component into bundled js files");
    this.log("\n");

    this.log("We suggest you open your component with your favorite IDE.\n Then start by typing:");
    if (this._componentPkgName() !== ".") {
      const cdPath = "    cd " + this._componentPkgName();
      this.log(chalk.cyan(cdPath));
    }
    this.log(chalk.cyan("    npm start"));
  }

  /**
   * Below here are helper functions.
   */

  _isBeginnerScaffolding() {
    return this.options[scaffoldingBeginner] || (this.answers && this.answers.scaffolding === scaffoldingBeginner);
  }

  _isReact() {
    return this.options["view-react"] || (this.answers && this.answers.viewFramework === react);
  }

  _componentName() {
    return this.options.componentName ? this.options.componentName : this.answers.componentName;
  }

  _getFileExtension() {
    return this._isReact() ? ".tsx" : ".ts";
  }

  _componentPkgName() {
    const name = this.options.componentName ? this.options.componentName : this.answers.componentName;
    return name.replace(" ", "-").toLowerCase();
  }

  _componentInterfaceModelName() {
    return `I${this._componentClassName()}`;
  }

  _componentClassName() {
    const name = this._componentName().replace(" ", "");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }

  _componentFactoryClassName() {
    return `${this._componentClassName()}InstantiationFactory`;
  }

  _generateNewProjectFile(currentFilePath, destinationPath) {
    destinationPath = destinationPath ? destinationPath : currentFilePath;
    const fileString = this.fs.read(this.templatePath(currentFilePath));

    const project = new Project({});

    return project.createSourceFile(
      this.destinationPath(destinationPath),
      fileString,
    );
  }
};
