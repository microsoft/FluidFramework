/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask, LeafWithDoneFileTask } from "./leafTask";
import { logVerbose } from "../../common/logging";
import { globFn, toPosixPath } from "../../common/utils";

export class WebpackTask extends LeafWithDoneFileTask {
    protected get doneFile() {
        // TODO: This assume there is only one webpack task per package
        return "webpack.done.build.log";
    }

    protected async getDoneFileContent() {
        try {
            const content: any = {};
            const srcGlob = toPosixPath(this.node.pkg.directory) + "/src/**/*.*";
            const srcFiles = await globFn(srcGlob);
            for (const srcFile of srcFiles) {
                content[srcFile] = await this.node.buildContext.fileHashCache.getFileHash(srcFile);
            }
            return JSON.stringify(content);
        } catch {
            return undefined;
        }
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        const executable = this.executable;
        for (const child of this.node.dependentPackages) {
            // TODO: Need to look at the output from tsconfig
            if (this.addChildTask(dependentTasks, child, "npm run build:esnext")) {
                this.logVerboseDependency(child, "build:esnext");
                if (this.addChildTask(dependentTasks, child, "npm run build:copy")) {
                    this.logVerboseDependency(child, "build:copy");
                }
            } else if (this.addChildTask(dependentTasks, child, "tsc")) {
                this.logVerboseDependency(child, "tsc");
                if (this.addChildTask(dependentTasks, child, "npm run build:copy")) {
                    this.logVerboseDependency(child, "build:copy");
                }
            } else if (child.task) {
                child.task.collectLeafTasks(dependentTasks);
                this.logVerboseDependency(child, "*");
            }
        }
    }
}