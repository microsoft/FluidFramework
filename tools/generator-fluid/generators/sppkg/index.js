/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const deepmerge = require("deepmerge");
const Generator = require("yeoman-generator");
const os = require("os");
const path = require("path");
const slug = require("slug");
const sortPackageJson = require("sort-package-json");
const uuid = require("uuid/v4");

/**
 * Go to the Yeoman Website to find out more about their generators in general.
 *
 * All functions **without** a _ to start are run sequentially from the start to end of the document.
 * Functions **with** a _ can be called as helper functions.
 */
module.exports = class extends Generator {
    constructor(args, opts) {
        super(args, opts);
        this.option("reset", {
            desc: "Reset the solution and component IDs",
            default: false,
            type: Boolean,
        });
        this.option("firstRun", {
            desc: "Behave as though this is the first run.",
            default: false,
            type: Boolean,
        });
    }

    initializing() {
        const pkg = this.fs.readJSON(this.destinationPath("package.json"));

        const defaultProps = {
            solutionVersion: "1.0.0.0",
            entrypoint: pkg.main || "./dist/main.bundle.js",
            entrypointFile: path.basename(pkg.main) || "main.bundle.js",
            manifestPath: "./src/Component.sppkg.manifest.json",
            componentName: slug(pkg.name),
            componentFriendlyName: slug(pkg.name),
            componentDescription: pkg.description || "",
            officeFabricIconFontName: "Lightbulb",
        };

        if (pkg.fluid.component) {
            pkg.fluid.component = deepmerge(defaultProps, pkg.fluid.component);
            if (this.options.reset) {
                pkg.fluid.component.componentId = uuid();
                pkg.fluid.component.solutionId = uuid();
            }
        } else {
            this.isFirstRun = true;
            pkg.fluid.component = defaultProps;
            pkg.fluid.component.componentId = uuid();
            pkg.fluid.component.solutionId = uuid();
        }
        this.pkg = pkg;

        if (this.options.firstRun) {
            this.isFirstRun = true;
        }
    }

    async prompting() {
        if (this.isFirstRun) {
            const answer = await this.prompt([
                {
                    type: "confirm",
                    name: "customize",
                    default: false,
                    message:
                        "Customize advanced options now? You can do this later by editing package.json and running the generator again.",
                },
            ]);
            this.customize = answer.customize;
        } else {
            const answer = await this.prompt([
                {
                    type: "confirm",
                    name: "customize",
                    default: false,
                    message: "It seems you have a config already. Want to further customize it?",
                },
            ]);
            this.customize = answer.customize;
        }

        if (this.customize) {
            const answers = await this._getComponentOptions();
            answers.entrypointFile = path.basename(answers.entrypoint);

            // merge the answers
            this.pkg.fluid.component = deepmerge(this.pkg.fluid.component, answers);
        }
    }

    copyConfigFiles() {
        if (this.isFirstRun) {
            this.fs.copyTpl(
                this.templatePath(".npmrc"), // FROM
                this.destinationPath(".npmrc"), // TO Base Folder
                this._context()
            );
        }

        this.fs.copyTpl(
            this.templatePath("config/config.json"), // FROM
            this.destinationPath("config/config.json"), // TO Base Folder
            this._context()
        );
        this.fs.copyTpl(
            this.templatePath("config/copy-assets.json"), // FROM
            this.destinationPath("config/copy-assets.json"), // TO Base Folder
            this._context()
        );
        this.fs.copyTpl(
            this.templatePath("config/deploy-azure-storage.json"), // FROM
            this.destinationPath("config/deploy-azure-storage.json"), // TO Base Folder
            this._context()
        );
        this.fs.copyTpl(
            this.templatePath("config/package-solution.json"), // FROM
            this.destinationPath("config/package-solution.json"), // TO Base Folder
            this._context()
        );
        this.fs.copyTpl(
            this.templatePath("config/serve.json"), // FROM
            this.destinationPath("config/serve.json"), // TO Base Folder
            this._context()
        );
        this.fs.copyTpl(
            this.templatePath("config/write-manifests.json"), // FROM
            this.destinationPath("config/write-manifests.json"), // TO Base Folder
            this._context()
        );
        this.fs.copyTpl(
            this.templatePath("gulpfile.js"), // FROM
            this.destinationPath("gulpfile.js"), // TO Base Folder
            this._context()
        );
    }

    copyManifest() {
        this.fs.copyTpl(
            this.templatePath("src/Component.sppkg.manifest.json"), // FROM
            this.destinationPath(this._context().manifestPath), // TO Base Folder
            this._context()
        );
    }

    updatePackageJson() {
        // temp copy; just want the template applied
        this.fs.copyTpl(
            this.templatePath("merge-package.json"), // FROM
            this.destinationPath("merge-package.json"), // TO Base Folder
            this._context()
        );

        const toMerge = this.fs.readJSON(this.destinationPath("merge-package.json"));

        var merged = deepmerge(toMerge, this.pkg);
        if (this.options.reset) {
            var scripts = deepmerge(merged.scripts, toMerge.scripts);
            merged.scripts = scripts;
        }

        merged = sortPackageJson(merged);
        this.fs.writeJSON(
            this.destinationPath("package.json"),
            merged,
            undefined, // replacer
            4 // space
        );
        // clean up the temp file
        this.fs.delete(this.destinationPath("merge-package.json"));
    }

    addToGitignore() {
        if (this.isFirstRun) {
            this.fs.append(
                this.destinationPath(".gitignore"),
                this.fs.read(this.templatePath("add.gitignore")),
                { separator: os.EOL + os.EOL }
            );
        }
    }

    install() {
        if (this.isFirstRun) {
            this.npmInstall();
        }
    }

    end() {
        this.log("Done!");
        return;
    }

    _context() {
        return this.pkg.fluid.component;
    }

    async _getComponentOptions() {
        return this.prompt([
            {
                type: "input",
                name: "componentFriendlyName",
                message: "Friendly name of the component",
                default: this.pkg.fluid.component.componentFriendlyName,
            },
            {
                type: "input",
                name: "componentName",
                message: "Short name of the component",
                default: this.pkg.fluid.component.componentName,
            },
            {
                type: "input",
                name: "componentDescription",
                message: "Description of the component",
                default: this.pkg.fluid.component.componentDescription,
            },
            {
                type: "input",
                name: "officeFabricIconFontName",
                message: "What Fabric icon would you like to use?",
                default: this.pkg.fluid.component.officeFabricIconFontName,
            },
            {
                type: "input",
                name: "entrypoint",
                message: "Path to your entrypoint",
                default: this.pkg.fluid.component.entrypoint,
            },
            {
                type: "input",
                name: "solutionVersion",
                message: "Version of the solution",
                default: this.pkg.fluid.component.solutionVersion,
                validate: input => {
                    const matched = /^\d+.\d+.\d+.\d+$/.test(input);
                    if (!matched) {
                        return "Must be in the form X.X.X.X, where X is a number.";
                    }
                    return matched;
                },
            },
            {
                type: "input",
                name: "manifestPath",
                message: "Path to the manifest file",
                default: this.pkg.fluid.component.manifestPath,
            },
        ]);
    }
};
