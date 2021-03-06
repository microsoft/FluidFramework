/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask } from "./leafTask";
import { TscTask, TscDependentTask } from "./tscTask";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import * as JSON5 from "json5";

abstract class LintBaseTask extends TscDependentTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {
        for (const child of this.node.dependentPackages) {
            // TODO: Need to look at the output from tsconfig
            if (this.addChildTask(dependentTasks, child, "tsc")) {
                this.logVerboseDependency(child, "tsc");
            }
        }
        super.addDependentTasks(dependentTasks);
    }
};

export class TsLintTask extends LintBaseTask {
    protected get doneFile() {
        // TODO: This assume there is only one tslint task per package
        return "tslint.done.build.log";
    }

    protected get configFileFullPath() {
        return this.getPackageFileFullPath("tslint.json");
    }
}

export class EsLintTask extends LintBaseTask {
    private _configFileFullPath: string | undefined
    protected get doneFile() {
        // TODO: This assume there is only one eslint task per package
        return "eslint.done.build.log";
    }

    protected get configFileFullPath() {
        if (!this._configFileFullPath) {
            // TODO: we currently don't support .cjs, .yaml and .yml, or config in package.json
            const possibleConfig = [".eslintrc.js", ".eslintrc.json", ".eslintrc"];
            for (const configFile of possibleConfig) {
                const configFileFullPath = this.getPackageFileFullPath(configFile);
                if (existsSync(configFileFullPath)) {
                    this._configFileFullPath = configFileFullPath;
                    break;
                }
            }
            if (!this._configFileFullPath) {
                throw new Error(`Unable to find config file for eslint ${this.command}`);
            }
        }
        return this._configFileFullPath;
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        let config: any;
        try {
            if (path.parse(this.configFileFullPath).ext !== ".js") {
                // TODO: optimize double read for TscDependentTask.getDoneFileContent and there.
                const configFile = readFileSync(this.configFileFullPath, "utf8");
                config = JSON5.parse(configFile);
            } else {
                config = require(this.configFileFullPath);
                if (config === undefined) {
                    throw new Error("Exports not found");
                }
            }
        } catch (e) {
            throw new Error(`Unable to parse options from ${this.configFileFullPath}. ${e}`)
        }
        if (config.parserOptions?.project) {
            for (const tsConfigPath of config.parserOptions?.project) {
                this.addTscTask(dependentTasks, { tsConfig: this.getPackageFileFullPath(tsConfigPath) });
            }
        }
        super.addDependentTasks(dependentTasks);
    }

    protected get useWorker() {
        // eslint can't use worker thread as it needs to change the current working directory
        return this.node.buildContext.workerPool?.useWorkerThreads === false;
    }
}

export class TsFormatTask extends LintBaseTask {
    protected get doneFile() {
        // TODO: This assume there is only one tsfmt task per package
        return "tsfmt.done.build.log";
    }

    protected get configFileFullPath() {
        // Currently there's no package-level config file, so just use tsconfig.json
        return this.getPackageFileFullPath("tsconfig.json");
    }
}
