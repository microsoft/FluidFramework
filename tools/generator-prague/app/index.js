var Generator = require("yeoman-generator");
var { Project } = require("ts-morph");
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
        filter: (input) => {
          input = input.replace(" ", "_");
          return input.replace(/\W/g, '');
        }
      },
      {
        type: "input",
        name: "local",
        message: "Would you like to run against a local server?",
        default: "n",
        choices: ["Y", "n"]
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
        default: "../tmp"
      }
    ]);
    this._setNewDestinationPath(this.answers.path);
    this._cleanDestination();
  }

  _setNewDestinationPath(path) {
    this.log("Modifying destination path");
    this.destinationRoot(path);
  }

  _cleanDestination() {
    this.log("Remove old tmp stuff");
    // this.fs.delete(this.destinationPath("./**/*"));
  }

  reiterateChoices() {
    this.log("App Name", this.answers.name);
    this.log("Running against", this.answers.local === "Y" ? "local" : "live");
  }

  getPathOfInvocation() {
    this.log("InvocationRoot", this.contextRoot);
  }

  getDestinationPath() {
    this.log("DestinationRoot", this.destinationRoot());
  }

  getTemplatePath() {
    this.log("Template path", this.templatePath());
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

    const fileString = this.fs.read(this.templatePath("src/index.ts"));

    const project = new Project({});

    const file = project.createSourceFile(this.destinationPath("src/index.ts"), fileString);

    file.getClass("Clicker").rename(this.answers.name);

    // TODO: Move this save so that it saves when the rest of the fs does a commit
    // Or write to a string and use fs to write.
    file.save();
  }

  runInstall() {
    this.npmInstall();
  }
};
