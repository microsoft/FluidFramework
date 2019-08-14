/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask } from "./leafTask";
import { logVerbose } from "../../common/logging";
import { readFileAsync, existsSync } from "../../common/utils";
import path from "path";

interface ITsBuildInfo {
    program: {
        fileInfos: { [key: string]: { version: string, signature: string } },
        semanticDiagnosticsPerFile: any[],
    }
}

export class TscTask extends LeafTask {
    protected addDependentTasks(dependentTasks: LeafTask[]) {
        const executable = this.executable;
        if (this.addChildTask(dependentTasks, this.node, "npm run build:genver")) {
            this.logVerboseDependency(this.node, "build:genver");
        }
        for (const child of this.node.dependentPackages) {
            // TODO: Need to look at the output from tsconfig
            if (this.addChildTask(dependentTasks, child, "tsc")) {
                this.logVerboseDependency(child, "tsc");
            }
        }
    }

    protected async checkLeafIsUpToDate() {
        // Using tsc incremental information
        const tsBuildInfo = await this.readTsBuildInfo();
        if (tsBuildInfo === undefined) { return false; }

        // Check previous build errors
        const diag: any[] = tsBuildInfo.program.semanticDiagnosticsPerFile;
        if (diag.some(item => Array.isArray(item))) {
            return false;
        }
        // Check dependencies file hashes
        const fileInfos = tsBuildInfo.program.fileInfos;
        for (const key of Object.keys(fileInfos)) {
            try {
                const hash = await this.node.buildContext.fileHashCache.getFileHash(key);
                if (hash !== fileInfos[key].version) {
                    logVerbose(`${this.node.pkg.nameColored}: version mismatch for ${key}, ${hash}, ${fileInfos[key].version}`)
                    return false;
                }
            } catch {
                logVerbose(`${this.node.pkg.nameColored}: exception generation hash for ${key}`)
                return false;
            }
        }

        // TODO: Needs to check if the tsconfig.json or the flags setting has changed
        return true;
    }

    protected get recheckLeafIsUpToDate() {
        return true;
    }

    private get configFile() {
        // TODO: parse the command line for real, split space for now.
        const args = this.command.split(" ");
        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] === "--project" || args[i] === "-p") {
                return args[i + 1];
            }
        }
        return "tsconfig.json";
    }

    private get configFileFullPath() {
        return path.join(this.node.pkg.directory, this.configFile);
    }

    private get tsBuildInfoFileName() {
        const configFile = this.configFile;
        const configName = configFile.endsWith(".json") ? configFile.substring(0, configFile.length - 5) : configFile;
        return `${configName}.tsbuildinfo`;
    }

    public get tsBuildInfoFile() {
        // TODO: should read the ts config to figure out where this is instead of guessing
        // https://github.com/Microsoft/TypeScript/issues/30925
        const tsBuildInfoFileRoot = this.tsBuildInfoFileName;
        const tsBuildInfoFileDist = path.join("dist", tsBuildInfoFileRoot);
        const tsBuildInfoFileLib = path.join("lib", tsBuildInfoFileRoot);
        if (existsSync(this.getPackageFileFullPath(tsBuildInfoFileRoot))) {
            return tsBuildInfoFileRoot;
        }
        if (existsSync(this.getPackageFileFullPath(tsBuildInfoFileDist))) {
            return tsBuildInfoFileDist;
        }
        if (existsSync(this.getPackageFileFullPath(tsBuildInfoFileLib))) {
            return tsBuildInfoFileLib;
        }
        return tsBuildInfoFileRoot;
    }

    private get tsBuildInfoFileFullPath() {
        return this.getPackageFileFullPath(this.tsBuildInfoFile);
    }

    private async readTsBuildInfo(): Promise<ITsBuildInfo | undefined> {
        const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
        try {
            return JSON.parse(await readFileAsync(tsBuildInfoFileFullPath, "utf8"));
        } catch {
            logVerbose(`${this.node.pkg.nameColored}: Unable to load ${tsBuildInfoFileFullPath}`)
            return undefined;
        }
    }
};