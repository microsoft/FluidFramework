var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
var chalk = require("chalk");

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);
  }

  async prompting() {
    this.answers = await this.prompt([
      {
        type: "input",
        name: "name",
        message: "Component Name",
        default: this.appname,
        filter: input => {
          input = input.replace(" ", "_");
          return input.replace(/\W/g, "");
        }
      },
      {
        type: "input",
        name: "description",
        message: "Chaincode Description",
        default: "Chaincode starter project"
      },
      {
        type: "input",
        name: "path",
        message: "Where would you like to put your prague component?",
        default: function(answers) {
          return "./" + answers.name;
        }
      }
    ]);
    this._setNewDestinationPath(this.answers.path);
  }

  _setNewDestinationPath(path) {
    this.destinationRoot(path);
  }

  moveBuildFiles() {
    this.fs.copy(
      this.templatePath("tsconfig.json"), // FROM
      this.destinationPath("tsconfig.json") // TO
    );

    this._movePackageFile();
    this._modifyComponent();

    this.fs.copy(
      this.templatePath("webpack.*.js"), // FROM
      this.destinationPath("./") // TO Base Folder
    );

    this.fs.copy(
      this.templatePath("getRoute.js"), // FROM
      this.destinationPath("./getRoute.js") // TO Base Folder
    );

    this.fs.copy(
      this.templatePath(".*"), // FROM
      this.destinationPath("./") // TO
    );
  }

  _movePackageFile() {
    var packageJson = this.fs.readJSON(this.templatePath("package.json"));
    packageJson.name = "@chaincode/" + this.answers.name;
    packageJson.description = this.answers.description;

    this.fs.writeJSON(
      this.destinationPath("package.json"), // TO
      packageJson // contents
    );
  }

  _modifyComponent() {
    const fileString = this.fs.read(this.templatePath("src/index.tsx"));

    const project = new Project({});

    const file = project.createSourceFile(
      this.destinationPath("src/index.tsx"),
      fileString
    );

    file.getClass("Clicker").rename(this.answers.name);

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
    file.save();
  }

  install() {
    this.log("Installing dependencies. This may take a minute.");
    this.npmInstall();
  }

  async end() {
    // await this._runInstall();

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

    this.log(chalk.cyan("    npm deploy"));
    this.log(
      "       Publishes the chaincode to https://packages.wu2.prague.office-int.com/#/"
    );
    this.log("\n");

    this.log("We suggest you start by typing:");
    if (this.answers.path !== ".") {
      const cdPath = "    cd " + this.answers.path;
      this.log(chalk.cyan(cdPath));
    }
    this.log(chalk.cyan("    npm start"));
  }

  // Helper Functions
  _cleanDestination() {
    this.log("Remove old tmp stuff");
    this.fs.delete(this.destinationPath("./**/*"));
  }

  _reiterateChoices() {
    this.log("App Name", this.answers.name);
    this.log("Running against", this.answers.local === "Y" ? "local" : "live");
  }

  _getPathOfInvocation() {
    this.log("InvocationRoot", this.contextRoot);
  }

  _getDestinationPath() {
    this.log("DestinationRoot", this.destinationRoot());
  }

  _getTemplatePath() {
    this.log("Template path", this.templatePath());
  }
};
