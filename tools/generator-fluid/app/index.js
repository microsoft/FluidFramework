/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
var chalk = require("chalk");

/**
 * Go to the Yeoman Website to find out more about their generators in general.
 * 
 * All functions **without** a _ to start are run sequentially from the start to end of the document.
 * Functions **with** a _ can be called as helper functions.
 */
module.exports = class extends Generator {
  async prompting() {
    this.log("Congratulations! You've started building your own Fluid component.");
    this.log("Let us help you get set up. Once we're done, you can start coding!");
    this.answers = await this.prompt([
      {
        type: "input",
        name: "name",
        message: "Component Name",
        default: this.appname,
        filter: input => {
          input = input.replace(" ", "_").toLowerCase();
          return input.replace(/\W/g, "");
        },
      },
      {
        type: "list",
        name: "template",
        message: "Which experience would you like to start with?",
        default: "react",
        choices: ["react", "vanillaJS"],
      },
      {
        type: "input",
        name: "description",
        message: "Component Description",
        default: "Fluid starter project",
      },
      {
        type: "input",
        name: "path",
        message: "Where would you like to put your Fluid component?",
        default: function (answers) {
          return "./" + answers.name;
        },
      },
    ]);

    this.destinationRoot(this.answers.path);
  }

  moveBuildFiles() {
    this.fs.copy(
      this.templatePath("tsconfig.json"), // FROM
      this.destinationPath("tsconfig.json"), // TO
    );

    this._copyPackageFile();
    this._copyComponent();
    this._copyFactory();

    this.fs.copy(
      this.templatePath("webpack.*.js"), // FROM
      this.destinationPath("./"), // TO Base Folder
    );

    this.fs.copy(
      this.templatePath("README.md"), // FROM
      this.destinationPath("./README.md"), // TO Base Folder
    );

    this.fs.copy(
      this.templatePath(".*"), // FROM
      this.destinationPath("./"), // TO
    );
  }

  /**
   * Copy over the package.json file
   */
  _copyPackageFile() {
    var packageJson = this.fs.readJSON(this.templatePath("package.json"));
    packageJson.name = "@yo-fluid/" + this.answers.name.toLowerCase();
    packageJson.description = this.answers.description;

    if (this.answers.template === "vanillaJS") {
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

  _copyComponent() {
    const componentFilePath = this.answers.template === "react" ? "src/main.tsx" : "src/main.ts";
    const fileString = this.fs.read(this.templatePath(componentFilePath));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath(componentFilePath),
      fileString,
    );

    const componentClassName = this.answers.name.charAt(0).toUpperCase() + this.answers.name.slice(1);
    file.getClass("DiceRoller").rename(componentClassName);

    file.getVariableDeclaration("DiceRollerInstantiationFactory").rename(`${componentClassName}InstantiationFactory`)

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
    file.save();
  }

  _copyFactory() {
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

    const componentClassName = this.answers.name.charAt(0).toUpperCase() + this.answers.name.slice(1);
    const factoryImportName = `${componentClassName}InstantiationFactory`;
    const importSpecifier = componentDec.addNamedImport(factoryImportName);
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
    this.log(chalk.green("Success.") + " Created component", this.answers.name);
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

    this.log(chalk.cyan("    npm run deploy"));
    this.log(
      "       Publishes the component to https://packages.wu2.prague.office-int.com/#/"
    );
    this.log("\n");

    this.log("We suggest you open your component with your favorite IDE.\n Then start by typing:");
    if (this.answers.path !== ".") {
      const cdPath = "    cd " + this.answers.path;
      this.log(chalk.cyan(cdPath));
    }
    this.log(chalk.cyan("    npm start"));
  }
};
