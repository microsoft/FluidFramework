/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask, LeafWithDoneFileTask } from "./leafTask";
import { toPosixPath, globFn, unquote, statAsync, readFileAsync } from "../../../common/utils";
import { logVerbose } from "../../../common/logging";
import { ScriptDependencies } from "../../../common/npmPackage";
import * as path from "path";
import { BuildPackage } from "../../buildGraph";

/* eslint-disable @typescript-eslint/no-empty-function */

export class EchoTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) { }
    protected async checkLeafIsUpToDate() { return true; }
}

export class LesscTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) { }
    protected async checkLeafIsUpToDate() {
        // TODO: assume lessc <src> <dst>
        const args = this.command.split(" ");
        if (args.length !== 3) {
            return false;
        }
        const srcPath = unquote(args[1]);
        const dstPath = unquote(args[2]);
        try {
            const srcTimeP = statAsync(path.join(this.node.pkg.directory, srcPath));
            const dstTimeP = statAsync(path.join(this.node.pkg.directory, dstPath));
            const [srcTime, dstTime] = await Promise.all([srcTimeP, dstTimeP]);
            const result = srcTime <= dstTime;
            if (!result) {
                this.logVerboseNotUpToDate();
            }
            return result;
        } catch (e: any) {
            logVerbose(`${this.node.pkg.nameColored}: ${e.message}`);
            this.logVerboseTrigger("failed to get file stats");
            return false;
        }
    }
}

export class CopyfilesTask extends LeafTask {
    private parsed: boolean = false;
    private readonly upLevel: number = 0;
    private readonly copySrcArg: string = "";
    private readonly copyDstArg: string = "";

    constructor(node: BuildPackage, command: string, scriptDeps: ScriptDependencies) {
        super(node, command, scriptDeps);

        // TODO: something better
        const args = this.command.split(" ");

        // Only handle -u arg
        let srcArgIndex = 1;
        if (args[1] === "-u" || args[1] === "--up") {
            if (3 >= args.length) {
                return;
            }
            this.upLevel = parseInt(args[2]);
            srcArgIndex = 3;
        }
        if (srcArgIndex !== args.length - 2) {
            return;
        }

        this.copySrcArg = unquote(args[srcArgIndex]);
        this.copyDstArg = unquote(args[srcArgIndex + 1]);

        this.parsed = true;
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        if (this.parsed) {
            if (this.copySrcArg.startsWith("src")) {
                return;
            }

            if (this.copySrcArg.startsWith("./_api-extractor-temp/doc-models/")) {
                this.addChildTask(dependentTasks, this.node, "api-extractor run --local");
                return;
            }
        }
        this.addAllDependentPackageTasks(dependentTasks);
    }
    protected async checkLeafIsUpToDate() {
        if (!this.parsed) {
            // If we could parse the argument, just say it is not up to date and run the command
            return false;
        }

        const srcGlob = path.join(this.node.pkg.directory, this.copySrcArg!);
        const srcFiles = await globFn(srcGlob, { nodir: true });
        const directory = toPosixPath(this.node.pkg.directory);
        const dstPath = directory + "/" + this.copyDstArg;
        const dstFiles = srcFiles.map(match => {
            const relPath = path.relative(directory, match);
            let currRelPath = relPath;
            for (let i = 0; i < this.upLevel; i++) {
                const index = currRelPath.indexOf(path.sep);
                if (index === -1) {
                    break;
                }
                currRelPath = currRelPath.substring(index + 1);
            }

            return path.join(dstPath, currRelPath);
        });
        return this.isFileSame(srcFiles, dstFiles);
    }

    private async isFileSame(srcFiles: string[], dstFiles: string[]) {
        try {
            const srcTimesP = Promise.all(srcFiles.map((match) => statAsync(match)));
            const dstTimesP = Promise.all(dstFiles.map((match) => statAsync(match)));
            const [srcTimes, dstTimes] = await Promise.all([srcTimesP, dstTimesP]);

            for (let i = 0; i < srcTimes.length; i++) {
                if (srcTimes[i].mtimeMs !== dstTimes[i].mtimeMs) {
                    this.logVerboseNotUpToDate();
                    return false;
                }

                if (srcTimes[i].size !== dstTimes[i].size) {
                    this.logVerboseNotUpToDate();
                    return false;
                }
            }
            return true;
        } catch (e: any) {
            logVerbose(`${this.node.pkg.nameColored}: ${e.message}`);
            this.logVerboseTrigger("failed to get file stats");
            return false;
        }
    }
}

export class GenVerTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) { }
    protected async checkLeafIsUpToDate() {
        try {
            const file = path.join(this.node.pkg.directory, "src/packageVersion.ts");
            const content = await readFileAsync(file, "utf8");
            const match = content.match(/.*\nexport const pkgName = "(.*)";[\n\r]*export const pkgVersion = "([0-9.]+)";.*/m);
            return (match !== null && this.node.pkg.name === match[1] && this.node.pkg.version === match[2]);
        } catch {
            return false;
        }
    }
}

export abstract class PackageJsonChangedTask extends LeafWithDoneFileTask {
    protected get doneFile(): string {
        return "package.json.done.build.log"
    }
    protected async getDoneFileContent(): Promise<string | undefined> {
        return JSON.stringify(this.package.packageJson);
    }
}

export class TypeValidationTask extends PackageJsonChangedTask {
    protected addDependentTasks(dependentTasks: LeafTask[]): void {
    }
}
