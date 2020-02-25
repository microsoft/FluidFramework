/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask } from "./leafTask";
import { toPosixPath, globFn, unquote, statAsync, readFileAsync } from "../../../common/utils";
import { logVerbose } from "../../../common/logging";
import * as path from "path";

export class EchoTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {}
    protected async checkLeafIsUpToDate() { return true; }
}

export class LesscTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {}
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
        } catch (e) {
            logVerbose(`${this.node.pkg.nameColored}: ${e.message}`);
            this.logVerboseTrigger("failed to get file stats");
            return false;
        }
    };
}

export class CopyfilesTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {}
    protected async checkLeafIsUpToDate() {
        // TODO: assume copyfiles -u 1 <src> <dst>
        const args = this.command.split(" ");
        if (args.length !== 5 && args[1] !== "-u" && args[2] !== "1") {
            return false;
        }
        const copySrcArg = unquote(args[3]);
        const copyDstArg = unquote(args[4]);
        const srcGlob = path.join(this.node.pkg.directory, copySrcArg);
        const srcFiles = await globFn(srcGlob);
        const directory = toPosixPath(this.node.pkg.directory);
        const srcPath = directory + "/src/";
        const dstPath = directory + "/" + copyDstArg;
        const dstFiles = srcFiles.map((match) => toPosixPath(match).replace(srcPath, dstPath));
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
        } catch (e) {
            logVerbose(`${this.node.pkg.nameColored}: ${e.message}`);
            this.logVerboseTrigger("failed to get file stats");
            return false;
        }
    }
}

export class GenVerTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {}
    protected async checkLeafIsUpToDate() {
        try {
            const file = path.join(this.node.pkg.directory, "src/packageVersion.ts");
            const content = await readFileAsync(file, "utf8");
            const match = content.match(/.*\nexport const pkgName = \"(.*)\";[\n\r]*export const pkgVersion = \"([0-9.]+)\";.*/m);
            return (match !== null && this.node.pkg.name === match[1] && this.node.pkg.version === match[2]);
        } catch {
        }
        return false;
    }
};