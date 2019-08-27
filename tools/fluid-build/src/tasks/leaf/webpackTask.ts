/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask, LeafWithDoneFileTask } from "./leafTask";
import { globFn, toPosixPath, } from "../../common/utils";
import { TscTask } from "./tscTask";

interface DoneFileContent {
    sources: { [srcFile: string]: string },
    dependencies: { [pkgName: string]: { [command: string]: any } },
}
export class WebpackTask extends LeafWithDoneFileTask {
    protected get doneFile() {
        // TODO: This assume there is only one webpack task per package
        return "webpack.done.build.log";
    }

    protected async getDoneFileContent() {
        try {
            const content: DoneFileContent = { sources: {}, dependencies: {}};
            const srcGlob = toPosixPath(this.node.pkg.directory) + "/src/**/*.*";
            const srcFiles = await globFn(srcGlob);
            for (const srcFile of srcFiles) {
                content.sources[srcFile] = await this.node.buildContext.fileHashCache.getFileHash(srcFile);
            }

            for (const dep of this.allDependentTasks) {
                if (dep.executable === "tsc") {
                    if (!content.dependencies[dep.package.name]) {
                        content.dependencies[dep.package.name] = {};
                    }
                    const tsBuildInfo = await (dep as TscTask).readTsBuildInfo();
                    if (tsBuildInfo === undefined) {
                        return undefined;
                    }
                    content.dependencies[dep.package.name][dep.command] = tsBuildInfo;
                }
            }
            return JSON.stringify(content);
        } catch {
            return undefined;
        }
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
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