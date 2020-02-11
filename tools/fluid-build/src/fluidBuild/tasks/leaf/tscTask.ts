/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { LeafTask } from "./leafTask";
import { logVerbose } from "../../../common/logging";
import { readFileAsync, existsSync } from "../../../common/utils";
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
    private _tsBuildInfoFullPath: string | undefined;
    private _tsBuildInfo: ITsBuildInfo | undefined;
    private _tsConfig: ts.ParsedCommandLine | undefined;
    private _tsConfigFullPath: string | undefined;

    protected addDependentTasks(dependentTasks: LeafTask[]) {
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
        const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
        if (tsBuildInfoFileFullPath === undefined) { return false; }

        const tsBuildInfoFileDirectory = path.dirname(tsBuildInfoFileFullPath);

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
                // Resolve relative path based on the directory of the tsBuildInfo file
                const fullPath = path.resolve(tsBuildInfoFileDirectory, key);
                const hash = await this.node.buildContext.fileHashCache.getFileHash(fullPath);
                if (hash !== fileInfos[key].version) {
                    logVerbose(`${this.node.pkg.nameColored}: version mismatch for ${key}, ${hash}, ${fileInfos[key].version}`);
                    return false;
                }
            } catch (e) {
                logVerbose(`${this.node.pkg.nameColored}: exception generating hash for ${key}`);
                logVerbose(e.stack);
                return false;
            }
        }

        // Check tsconfig.json
        return this.checkTsConfig(tsBuildInfoFileDirectory, tsBuildInfo);
    }

    private checkTsConfig(tsBuildInfoFileDirectory: string, tsBuildInfo: ITsBuildInfo) {
        const options = this.readTsConfig();
        if (!options) {
            return false;
        }

        const configOptions = { ...options.options };
        const tsBuildInfoOptions = { ...tsBuildInfo.program.options };
        // Patch relative path based on tsBuildInfo file directory.
        const pathKeys = ["configFilePath", "declarationDir", "outDir", "rootDir", "project"];
        const patch = (object: any, keys: string[], dir: string) => {
            for (const key of keys) {
                const value = object[key];
                if (value !== undefined) {
                    object[key] = path.resolve(dir, value);
                }
            }
        }

        const configFileFullPath = this.configFileFullPath;
        if (!configFileFullPath) { assert.fail(); };

        patch(configOptions, pathKeys, path.dirname(configFileFullPath));
        patch(tsBuildInfoOptions, pathKeys, tsBuildInfoFileDirectory);

        if (!isEqual(configOptions, tsBuildInfoOptions)) {
            logVerbose(`${this.node.pkg.nameColored}: ts option changed ${configFileFullPath}`);
            logVerbose("Config:")
            logVerbose(JSON.stringify(configOptions, undefined, 2));
            logVerbose("BuildInfo:");
            logVerbose(JSON.stringify(tsBuildInfoOptions, undefined, 2));
            return false;
        }
        return true;
    }

    private readTsConfig() {
        if (this._tsConfig == undefined) {
            const args = this.command.split(" ");

            const parsedCommand = this.parsedCommandLine;
            if (!parsedCommand) { return undefined; }
                
            const configFileFullPath = this.configFileFullPath;
            if (!configFileFullPath) { return undefined; }

            const configFile = ts.readConfigFile(configFileFullPath, ts.sys.readFile);
            if (configFile.error) {
                logVerbose(`${this.node.pkg.nameColored}: ts fail to parse ${configFileFullPath}`);
                return undefined;
            }
            const options = ts.parseJsonConfigFileContent(configFile.config, ts.sys, this.node.pkg.directory, parsedCommand.options, configFileFullPath);
            if (options.errors.length) {
                logVerbose(`${this.node.pkg.nameColored}: ts fail to parse file content ${configFileFullPath}`);
                return undefined;
            }
            this._tsConfig = options;

            if (!options.options.incremental) {
                console.warn(`${this.node.pkg.nameColored}: warning: incremental not enabled`);
            }
        }

        return this._tsConfig;
    }
    protected get recheckLeafIsUpToDate() {
        return true;
    }

    private get configFileFullPath() {
        if (this._tsConfigFullPath === undefined) {
            // TODO: parse the command line for real, split space for now.
            const args = this.command.split(" ");

            const parsedCommand = this.parsedCommandLine;
            if (!parsedCommand) { return undefined; }

            const project = parsedCommand.options.project;
            if (project !== undefined) {
                this._tsConfigFullPath = path.resolve(this.node.pkg.directory, project);
            } else {
                const foundConfigFile = ts.findConfigFile(this.node.pkg.directory, ts.sys.fileExists, "tsconfig.json");
                if (foundConfigFile) {
                    this._tsConfigFullPath = foundConfigFile;
                } else {
                    this._tsConfigFullPath = path.join(this.node.pkg.directory, "tsconfig.json");
                }
            }
        }
        return this._tsConfigFullPath;
    }

    private get parsedCommandLine() {
         // TODO: parse the command line for real, split space for now.
         const args = this.command.split(" ");

         const parsedCommand = ts.parseCommandLine(args);
         if (parsedCommand.errors.length) {
            logVerbose(`${this.node.pkg.nameColored}: ts fail to parse command line ${this.command}`);
            return undefined;
        }
         return parsedCommand;
    }

    private get tsBuildInfoFileName() {
        const configFileFullPath = this.configFileFullPath;
        if (!configFileFullPath) { return undefined; }

        const configFileParsed = path.parse(configFileFullPath);
        if (configFileParsed.ext === ".json") {
            return `${configFileParsed.name}.tsbuildinfo`;
        }
        return `${configFileParsed.name}${configFileParsed.ext}.tsbuildinfo`;
    }

    private getTsBuildInfoFileFromConfig() {
        const options = this.readTsConfig();
        if (!options || !options.options.incremental) {
            return undefined;
        }

        const outFile = options.options.out ? options.options.out : options.options.outFile;
        if (outFile) {
            return `${outFile}.tsbuildinfo`;
        }

        const configFileFullPath = this.configFileFullPath;
        if (!configFileFullPath) { return undefined; }

        const tsBuildInfoFileName = this.tsBuildInfoFileName;
        if (!tsBuildInfoFileName) { return undefined; }

        if (options.options.outDir) {
            if (options.options.rootDir) {
                const relative = path.relative(options.options.rootDir, path.parse(configFileFullPath).dir);
                return path.join(options.options.outDir, relative, tsBuildInfoFileName);
            }
            return path.join(options.options.outDir, tsBuildInfoFileName);
        }
        return path.join(path.parse(configFileFullPath).dir, tsBuildInfoFileName);
    }

    private get tsBuildInfoFileFullPath() {
        if (this._tsBuildInfoFullPath === undefined) {
            const infoFile = this.getTsBuildInfoFileFromConfig();
            if (infoFile) {
                if (path.isAbsolute(infoFile)) {
                    this._tsBuildInfoFullPath = infoFile;
                } else {
                    this._tsBuildInfoFullPath = this.getPackageFileFullPath(infoFile);
                }
            }
        }
        return this._tsBuildInfoFullPath;
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

    public async readTsBuildInfo(): Promise<ITsBuildInfo | undefined> {
        if (this._tsBuildInfo === undefined) {
            const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
            if (tsBuildInfoFileFullPath && existsSync(tsBuildInfoFileFullPath)) {
                try {
                    this._tsBuildInfo = JSON.parse(await readFileAsync(tsBuildInfoFileFullPath, "utf8"));
                    return this._tsBuildInfo;
                } catch {
                    logVerbose(`${this.node.pkg.nameColored}: Unable to load ${tsBuildInfoFileFullPath}`);
                }
            } else {
                logVerbose(`${this.node.pkg.nameColored}: ${this.tsBuildInfoFileName} file not found`);
            }
        }
        return this._tsBuildInfo;
    }

    protected async markExecDone() {
        this._tsBuildInfo = undefined;
    }
};