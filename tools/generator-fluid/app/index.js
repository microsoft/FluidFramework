/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
var chalk = require("chalk");

const vanillaJS = "vanillaJS";
const react = "react";

/**
 * Go to the Yeoman Website to find out more about their generators in general.
 *
 * All functions **without** a _ to start are run sequentially from the start to end of the document.
 * Functions **with** a _ can be called as helper functions.
 */
module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

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
    this.option(
      "noinstall",
      {
        description: "Sets VanillaJS as Default View",
        alias: "ni"
      });

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
    const questions = [];
    if (this.options.componentName) {
      this.log(`Component Name: ${this.options.componentName}`)
    } else {
      questions.push({
        type: "input",
        name: "componentName",
        message: "What the name of your new component?",
      });
    }

    if (this.options.react && this.options.vanillaJS) {
      this.log(chalk.yellow("Both --react and --vanilla have been selected. Using react"));
      delete this.options["vanillaJS"];
    } else if (this.options.react) {
      this.log("--react flag set. Using React")
    } else if (this.options.vanillaJS) {
      this.log("--vanilla flag set. Using vanillaJS")
    } else {
      questions.push({
        type: "list",
        name: "template",
        message: "Which view framework would you like to start with?",
        default: react,
        choices: [react, vanillaJS],
      });
    }

    if (questions) {
      this.answers = await this.prompt(questions);
    }

    this.destinationRoot(this._componentPkgName());
  }

  moveAndModifyTemplateFiles() {
    this._copyAndModifyPackageJsonFile();
    this._copyAndModifyComponentFile();

    this.fs.copy(
      this.templatePath("src/model.ts"), // FROM
      this.destinationPath("./src/model.ts"), // TO
    );

    this.fs.copy(
      this.templatePath("src/index.ts"), // FROM
      this.destinationPath("./src/index.ts"), // TO
    );

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
    const componentFilePath = `src/component${this._getFileExtension()}`;
    const fileString = this.fs.read(this.templatePath(componentFilePath));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath(componentFilePath),
      fileString,
    );

    // Replace the class name with the component name provided
    file.getClass("DiceRoller").rename(this._componentClassName());

    // Replace the ComponentName return value with the pkg name
    file.replace("<component-pkg-name>", this._componentPkgName())

    // Replace class name in comments
    file.replace("<component-class-name>", this._componentClassName())

    file.getClass("").getLeadingCommentRanges()

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
    if (this.options.noinstall) {
      this.log("skipping install because of --noinstall flag");
      return;
    }

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
   * 
   * Ideally there should be no direct references to this.answers or this.options above.
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
    this.log("NAME " + name);
    this.log("NAME - options " + this.options.componentName);
    this.log("NAME - answers " + this.answers.componentName);
    return name.replace(" ", "-").toLowerCase();
  }

  _componentClassName() {
    const name = this._componentName().replace(" ", "");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }

  _componentFactoryClassName() {
    return `${this._componentClassName()}InstantiationFactory`;
  }
};
