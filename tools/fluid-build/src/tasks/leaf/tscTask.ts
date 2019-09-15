/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LeafTask } from "./leafTask";
import { logVerbose } from "../../common/logging";
import { readFileAsync, existsSync } from "../../common/utils";
import path from "path";
import * as ts from "typescript";
const isEqual = require("lodash.isequal");

interface ITsBuildInfo {
    program: {
        fileInfos: { [key: string]: { version: string, signature: string } },
        semanticDiagnosticsPerFile: any[],
        options: any
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

        // Check tsconfig.json
        return this.checkTsConfig(tsBuildInfo);
    }

    protected checkTsConfig(tsBuildInfo: ITsBuildInfo) {
        const args = this.command.split(" ");

        const parsedCommand = ts.parseCommandLine(args);
        if (parsedCommand.errors.length) {
            logVerbose(`${this.node.pkg.nameColored}: ts fail to parse command line ${this.command}`);
            return false;
        }

        const configFileFullPath = this.configFileFullPath;
        const configFile = ts.readConfigFile(configFileFullPath, ts.sys.readFile);
        if (configFile.error) {
            logVerbose(`${this.node.pkg.nameColored}: ts fail to parse ${configFileFullPath}`);
            return false;
        }
        const options = ts.parseJsonConfigFileContent(configFile.config, ts.sys, this.node.pkg.directory, parsedCommand.options, configFileFullPath);
        if (options.errors.length) {
            logVerbose(`${this.node.pkg.nameColored}: ts fail to parse file content ${configFileFullPath}`);
            return false;
        }

        if (!isEqual(options.options, tsBuildInfo.program.options)) {
            logVerbose(`${this.node.pkg.nameColored}: ts option changed ${configFileFullPath}`);
            return false;
        }
        return true;
    }

    protected get recheckLeafIsUpToDate() {
        return true;
    }

    private get configFileFullPath() {
        // TODO: parse the command line for real, split space for now.
        const args = this.command.split(" ");

        const parsedCommand = ts.parseCommandLine(args);
        const project = parsedCommand.options.project;
        if (project !== undefined) {
            return path.resolve(this.node.pkg.directory, project);
        }
        const foundConfigFile = ts.findConfigFile(this.node.pkg.directory, ts.sys.fileExists, "tsconfig.json");
        if (foundConfigFile) {
            return foundConfigFile;
        }
        return path.join(this.node.pkg.directory, "tsconfig.json");
    }

    private get tsBuildInfoFileName() {
        const configFileFullPath = this.configFileFullPath;
        const configFileParsed = path.parse(configFileFullPath);
        if (configFileParsed.ext === ".json") {
            return `${configFileParsed.name}.tsbuildinfo`;
        }
        return `${configFileParsed.name}${configFileParsed.ext}.tsbuildinfo`;
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

    protected getVsCodeErrorMessages(errorMessages: string) {
        const lines = errorMessages.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.length && line[0] !== ' ') {
                lines[i] = `${this.node.pkg.directory}/${line}`;
            }
        }
        return lines.join("\n");
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