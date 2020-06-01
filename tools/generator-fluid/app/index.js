/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
var chalk = require("chalk");

const none = "none";
const react = "react";

const questions = {
    componentName: {
        type: "input",
        name: "componentName",
        message: "What is the name of your new component?",
    },
    viewFramework : {
        type: "list",
        name: "viewFramework",
        message: "Which view framework would you like to start with?",
        default: react,
        choices: [react, none],
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
        type: Boolean,
      });

    // Adding argument to specify the component name inline
    this.argument(
      "componentName",
      {
        type: String,
        required: false,
        description: "Defines the Component Name"
      });
  }

  async prompting() {
    this.log("Congratulations! You've started building your own Fluid Component.");
    this.log("Let us help you get set up. Once we're done, you can start coding!");
    const questionsCollection = [];
    if (this.options.componentName) {
      this.log(`${chalk.green("?")} ${questions.componentName.message} ${this._componentName()}`)
    } else {
      questionsCollection.push(questions.componentName);
    }

    if (this.options["view-react"] && this.options["view-none"]) {
      this.log(chalk.yellow("Both --react and --no-view have been selected. Defaulting to react"));
      delete this.options["view-none"];
    }

    if (this.options["view-react"] || this.options["view-none"]) {
      this.log(`${chalk.green("?")} ${questions.viewFramework.message} ${chalk.blue(this._isReact() ? react : none)}`)
    } else {
      questionsCollection.push(questions.viewFramework);
    }

    if (questionsCollection) {
      this.answers = await this.prompt(questionsCollection);
    }

    this.destinationRoot(this._componentPkgName());
  }

  moveAndModifyTemplateFiles() {

    // Copy and Modify Files
    this._copyAndModifyPackageJsonFile();
    this._copyAndModifyComponentFile();
    this._copyAndModifyIndexFile();
    this._copyAndModifyInterfaceFile();
    this._copyAndModifyViewFile();

    // Copy Remaining Files
    this.fs.copyTpl(
      this.templatePath("README.md"), // FROM
      this.destinationPath("./README.md"), // TO Root Folder,
      { extension: this._getFileExtension() },
    );

    this.fs.copy(
      this.templatePath("webpack.config.js"), // FROM
      this.destinationPath("./webpack.config.js"), // TO Root Folder
    );

    this.fs.copy(
      this.templatePath("tsconfig.json"), // FROM
      this.destinationPath("tsconfig.json"), // TO Root Folder
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
    varDec.set({
      initializer: `${this._componentClassName()}.factory`,
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

  _generateNewProjectFile(currentFilePath) {
    const fileString = this.fs.read(this.templatePath(currentFilePath));

    const project = new Project({});

    return project.createSourceFile(
      this.destinationPath(currentFilePath),
      fileString,
    );
  }
};
