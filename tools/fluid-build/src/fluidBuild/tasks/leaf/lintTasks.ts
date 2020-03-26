/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask } from "./leafTask";
import { TscDependentTask } from "./tscTask";
import { existsSync } from "fs";

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
        // TODO: This assume there is only one tslint task per package
        return "eslint.done.build.log";
    }

    protected get configFileFullPath() {
        if (!this._configFileFullPath) {
            const jsonConfig = this.getPackageFileFullPath(".eslintrc.json");
            if (existsSync(jsonConfig)) {
                this._configFileFullPath = jsonConfig;
            } else {
                this._configFileFullPath = this.getPackageFileFullPath(".eslintrc.js");
            }
        }
        return this._configFileFullPath;
    }
}
