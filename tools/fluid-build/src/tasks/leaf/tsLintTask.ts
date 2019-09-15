/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask, LeafWithDoneFileTask } from "./leafTask";
import { logVerbose } from "../../common/logging";
import { TscTask } from "./tscTask";
import { readFileAsync } from "../../common/utils";

export class TsLintTask extends LeafWithDoneFileTask {
    private tscTask: TscTask | undefined;
    protected get recheckLeafIsUpToDate() {
        return true;
    }
    protected get doneFile() {
        // TODO: This assume there is only one tslint task per package
        return "tslint.done.build.log";
    }

    protected async getDoneFileContent() {
        try {
            const doneFileContent = { tsBuildInfoFile: "", tslintJson: "" };
            if (this.tscTask) {
                const tsBuildInfoFile = this.tscTask.tsBuildInfoFile;
                if (tsBuildInfoFile) {
                    doneFileContent.tsBuildInfoFile = await readFileAsync(this.getPackageFileFullPath(tsBuildInfoFile), "utf8");
                }
                doneFileContent.tslintJson = await readFileAsync(this.configFileFullPath, "utf8");
            }
            return JSON.stringify(doneFileContent);
        } catch {
            return undefined;
        }
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        const executable = this.executable;
        for (const child of this.node.dependentPackages) {
            // TODO: Need to look at the output from tsconfig
            if (this.addChildTask(dependentTasks, child, "tsc")) {
                this.logVerboseDependency(child, "tsc");
            }
        }
        const tscTask = this.addChildTask(dependentTasks, this.node, "tsc");
        if (tscTask) {
            this.tscTask = tscTask as TscTask;
            this.logVerboseDependency(this.node, "tsc");
        }
    }

    private get configFileFullPath() {
        return this.getPackageFileFullPath("tslint.json");
    }

}