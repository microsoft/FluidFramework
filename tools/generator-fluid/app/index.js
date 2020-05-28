/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
var chalk = require("chalk");

const vanillaJS = "vanillaJS";
const react = "react";

const questions = {
    componentName: {
        type: "input",
        name: "componentName",
        message: "What is the name of your new component?",
    },
    template : {
        type: "list",
        name: "template",
        message: "Which view framework would you like to start with?",
        default: react,
        choices: [react, vanillaJS],
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
      "react",
      {
        description: "Sets React as Default View",
        alias: "r"
      });
    this.option(
      "vanilla",
      {
        description: "Sets VanillaJS as Default View",
        alias: "v"
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

    if (this.options.react && this.options.vanilla) {
      this.log(chalk.yellow("Both --react and --vanilla have been selected. Defaulting to react"));
      delete this.options["vanillaJS"];
    }

    if (this.options.react || this.options.vanilla) {
      this.log(`${chalk.green("?")} ${questions.template.message} ${chalk.blue(this._isReact() ? react : vanillaJS)}`)
    } else {
      questionsCollection.push(questions.template);
    }

    if (questionsCollection) {
      this.answers = await this.prompt(questionsCollection);
    }

    this.destinationRoot(this._componentPkgName());
  }

  moveAndModifyTemplateFiles() {
    this._copyAndModifyPackageJsonFile();
    this._copyAndModifyComponentFile();
    this._copyAndModifyIndexFile();
    this._copyAndModifyModelFile();

    this.fs.copy(
      this.templatePath(`src/view${this._getFileExtension()}`), // FROM
      this.destinationPath(`./src/view${this._getFileExtension()}`), // TO
    );

    this.fs.copyTpl(
      this.templatePath("README.md"), // FROM
      this.destinationPath("./README.md"), // TO Base Folder,
      { extension: this._getFileExtension() },
    );

    this.fs.copy(
      this.templatePath("webpack.config.js"), // FROM
      this.destinationPath("./webpack.config.js"), // TO Base Folder
    );

    this.fs.copy(
      this.templatePath("tsconfig.json"), // FROM
      this.destinationPath("tsconfig.json"), // TO Base Folder
    );

    // Copy the .* files from the base
    this.fs.copy(
      this.templatePath(".*"), // FROM
      this.destinationPath("./"), // TO Base Folder
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
    const filePath = `src/component${this._getFileExtension()}`;
    const fileString = this.fs.read(this.templatePath(filePath));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath(filePath),
      fileString,
    );

    const classObj = file.getClass("DiceRoller");
    // Rename the class name with the component name provided
    classObj.rename(this._componentClassName());

    // Replace ComponentName response with package name
    const accessor = classObj.getGetAccessor("ComponentName");
    accessor.setBodyText(`return "${this._componentPkgName()}";`);

    // Rename model interface name to match new component name
    const imports = file.getImportDeclaration("./model");
    const interfaceImport = imports.getNamedImports()[0];
    interfaceImport.setName(this._componentInterfaceModelName());

    classObj.removeImplements(0);
    classObj.insertImplements(0, this._componentInterfaceModelName());

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
    file.save();
  }

  _copyAndModifyIndexFile() {
    const filePath = "src/index.ts";
    const fileString = this.fs.read(this.templatePath(filePath));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath(filePath),
      fileString,
    );

    const imports = file.getImportDeclaration("./component");
    const componentImport = imports.getNamedImports()[0];
    componentImport.setName(this._componentClassName());

    const exportDeclaration = file.getExportDeclaration(d => d.hasNamedExports());
    const namedExport = exportDeclaration.getNamedExports()[0];
    namedExport.setName(this._componentClassName());

    const variableStatement = file.getVariableStatement("fluidExport");
    const varDec = variableStatement.getDeclarations()[0];
    varDec.set({
      initializer: `${this._componentClassName()}.factory`,
    });

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
    file.save();
  }

  _copyAndModifyModelFile() {
    const filePath = "src/model.ts";
    const fileString = this.fs.read(this.templatePath(filePath));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath(filePath),
      fileString,
    );

    const modelInterface = file.getInterface("IDiceRoller");
    modelInterface.rename(this._componentInterfaceModelName())

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
    file.save();
  }

  _copyContainer() {
    const fileString = this.fs.read(this.templatePath("src/index.ts"));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath("src/index.ts"),
      fileString,
    );

    // Change Classname plus references
    const componentDec = file.getImportDeclaration((dec) => {
      return dec.isModuleSpecifierRelative();
    });

    const importSpecifier = componentDec.addNamedImport(this._componentFactoryClassName());
    importSpecifier.setAlias("ComponentInstantiationFactory");

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
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
   * Below here are helper files.
   */

  _isReact() {
    return this.options.react || this.answers.template === react;
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
};
