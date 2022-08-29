/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask, LeafWithDoneFileTask } from "./leafTask";
import { BuildPackage } from "../../buildGraph";
import { ScriptDependencies } from "../../../common/npmPackage";
import { globFn, existsSync, readFileAsync } from "../../../common/utils";
import ignore from "ignore";

export class PrettierTask extends LeafWithDoneFileTask {
    private parsed: boolean = false;
    private glob: string | undefined;
    constructor(node: BuildPackage, command: string, scriptDeps: ScriptDependencies) {
        super(node, command, scriptDeps);

        // TODO: something better
        const args = this.command.split(" ");
        if (args[0] !== "prettier") {
            return;
        }
        for (let i = 1; i < args.length; i++) {
            if (args[i].startsWith("--")) {
                if (args[i] === "--check") {
                    continue;
                }
                return;
            }
            if (this.glob) {
                return;
            }
            this.glob = args[i];
            if (this.glob.startsWith('"') && this.glob.endsWith('"')) {
                this.glob = this.glob.substring(1, this.glob.length - 1);
            }
        }
        this.parsed = this.glob !== undefined;
    }
    protected get configFileFullPath() {
        // Currently there's no package-level config file, so just use tsconfig.json
        return this.getPackageFileFullPath(".prettierrc.json");
    }

    protected async getDoneFileContent() {
        if (!this.parsed) {
            this.logVerboseTask(`error generating done file content, unable to understand command line`);
            return undefined;
        }

        let ignoreEntries: string[] = [];
        try {
            const ignoreFile = this.getPackageFileFullPath(".prettierignore");

            if (existsSync(ignoreFile)) {
                const ignoreFileContent = await readFileAsync(ignoreFile, "utf8");
                ignoreEntries = ignoreFileContent.split(/\r?\n/);
                ignoreEntries = ignoreEntries.filter((value) => value && !value.startsWith("#"));
            }
        } catch (e) {
            this.logVerboseTask(`error generating done file content, unable to read .prettierignore file`);
            return undefined;
        }
        const ignoreObject = ignore().add(ignoreEntries);
        try {
            let files = await globFn(this.glob!, { cwd: this.node.pkg.directory });
            files = ignoreObject.filter(files);
            const hashesP = files.map(async (name) => {
                const hash = await this.node.buildContext.fileHashCache.getFileHash(this.getPackageFileFullPath(name));
                return { name, hash };
            });
            const hashes = await Promise.all(hashesP);
            return JSON.stringify(hashes);
        } catch (e) {
            this.logVerboseTask(`error generating done file content. ${e}`);
            return undefined;
        }
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        // Prettier has no dependent tasks, assuming we don't lint build output files
    }
}
