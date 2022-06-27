/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { LeafTask, LeafWithDoneFileTask } from "./leafTask";
import { logVerbose } from "../../../common/logging";
import { readFileAsync, existsSync, isSameFileOrDir } from "../../../common/utils";
import path from "path";
import * as ts from "typescript";
import * as TscUtils from "../../tscUtils";
import * as fs from "fs";
const isEqual = require("lodash.isequal");

interface ITsBuildInfo {
    program: {
        fileNames: string[],
        fileInfos: (string | { version: string, affectsGlobalScope: true })[],
        semanticDiagnosticsPerFile?: any[],
        options: any
    }
}

interface TscTaskMatchOptions {
    tsConfig?: string;
}

export class TscTask extends LeafTask {
    private _tsBuildInfoFullPath: string | undefined;
    private _tsBuildInfo: ITsBuildInfo | undefined;
    private _tsConfig: ts.ParsedCommandLine | undefined;
    private _tsConfigFullPath: string | undefined;
    private _projectReference: TscTask | undefined;
    private _sourceStats: (fs.Stats | fs.BigIntStats)[] | undefined;

    public matchTask(command: string, options?: TscTaskMatchOptions): LeafTask | undefined {
        if (!options?.tsConfig) { return super.matchTask(command); }
        if (command !== "tsc") { return undefined; }
        const configFile = this.configFileFullPath;
        if (!configFile) { return undefined; }
        return isSameFileOrDir(configFile, options.tsConfig) ? this : undefined;
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        if (this.addChildTask(dependentTasks, this.node, "npm run build:gen")) {
            this.logVerboseDependency(this.node, "build:gen");
        }

        if (this.addChildTask(dependentTasks, this.node, "npm run build:genver")) {
            this.logVerboseDependency(this.node, "build:genver");
        }

        const testConfig = path.join("src", "test", "tsconfig.json");
        const isTestTsc = this.configFileFullPath && isSameFileOrDir(this.configFileFullPath, this.getPackageFileFullPath(testConfig));
        for (const child of this.node.dependentPackages) {
            // TODO: Need to look at the output from tsconfig
            if (this.addChildTask(dependentTasks, child, "tsc")) {
                this.logVerboseDependency(child, "tsc");
            }

            if (isTestTsc) {
                // TODO: Not all test package depends on test from dependents.
                // Can check if the dependent's tsconfig has declaration generated or not
                if (this.addChildTask(dependentTasks, child, "npm run build:test")) {
                    this.logVerboseDependency(child, "build:test");
                }
            }
        }

        const config = this.readTsConfig();
        if (config?.projectReferences) {
            // TODO: make less assumptions
            if (config.projectReferences.length !== 1) {
                throw new Error(`${this.node.pkg.nameColored}: Only one project references is supported`);
            }
            if (!isSameFileOrDir(config.projectReferences[0].path, this.node.pkg.directory)) {
                throw new Error(`${this.node.pkg.nameColored}: Only package root project is supported for project references`);
            }
            this._projectReference = this.addChildTask(dependentTasks, this.node, "tsc") as TscTask | undefined;
            if (!this._projectReference) {
                throw new Error(`${this.node.pkg.nameColored}: tsc not found for project reference`);
            }
            this.logVerboseDependency(this.node, "tsc");
        }
    }

    protected async checkLeafIsUpToDate() {
        const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
        if (tsBuildInfoFileFullPath === undefined) { return false; }

        const tsBuildInfoFileDirectory = path.dirname(tsBuildInfoFileFullPath);

        // Using tsc incremental information
        const tsBuildInfo = await this.readTsBuildInfo();
        if (tsBuildInfo === undefined) {
            this.logVerboseTrigger("tsBuildInfo not found");
            return false;
        }

        // Check previous build errors
        const diag = tsBuildInfo.program.semanticDiagnosticsPerFile;
        if (diag?.some(item => Array.isArray(item))) {
            this.logVerboseTrigger("previous build error");
            return false;
        }
        // Check dependencies file hashes
        const fileNames = tsBuildInfo.program.fileNames;
        const fileInfos = tsBuildInfo.program.fileInfos;
        for (let i = 0; i < fileInfos.length; i++) {
            const fileInfo = fileInfos[i];
            const fileName = fileNames[i];
            if (fileName === undefined) {
                this.logVerboseTrigger(`missing file name for file info id ${i}`);
                return false;
            }
            try {
                // Resolve relative path based on the directory of the tsBuildInfo file
                let fullPath = path.resolve(tsBuildInfoFileDirectory, fileName);

                // If we have project reference, see if this is in reference to one of the file, and map it to the d.ts file instead
                if (this._projectReference) {
                    fullPath = this._projectReference.remapSrcDeclFile(fullPath);
                }
                const hash = await this.node.buildContext.fileHashCache.getFileHash(fullPath);
                const version = typeof fileInfo === "string" ? fileInfo : fileInfo.version;
                if (hash !== version) {
                    this.logVerboseTrigger(`version mismatch for ${fileName}, ${hash}, ${version}`);
                    return false;
                }
            } catch (e: any) {
                this.logVerboseTrigger(`exception generating hash for ${fileName}`);
                logVerbose(e.stack);
                return false;
            }
        }

        // Check tsconfig.json
        return this.checkTsConfig(tsBuildInfoFileDirectory, tsBuildInfo);
    }

    private remapSrcDeclFile(fullPath: string) {
        if (!this._sourceStats) {
            const config = this.readTsConfig();
            this._sourceStats = config ? config.fileNames.map(v => fs.lstatSync(v)) : [];
        }

        const parsed = path.parse(fullPath);
        const directory = parsed.dir;
        const stat = fs.lstatSync(fullPath);
        if (this._sourceStats.some(value => isEqual(value, stat))) {
            return this.remapOutFile(this.readTsConfig()!, directory, `${parsed.name}.d.ts`);
        }
        return fullPath;
    }

    private checkTsConfig(tsBuildInfoFileDirectory: string, tsBuildInfo: ITsBuildInfo) {
        const options = this.readTsConfig();
        if (!options) {
            return false;
        }

        const configFileFullPath = this.configFileFullPath;
        if (!configFileFullPath) { assert.fail(); }

        // Patch relative path based on the file directory where the config comes from
        const configOptions = TscUtils.filterIncrementalOptions(
            TscUtils.convertToOptionsWithAbsolutePath(options.options, path.dirname(configFileFullPath)));
        const tsBuildInfoOptions =
            TscUtils.convertToOptionsWithAbsolutePath(tsBuildInfo.program.options, tsBuildInfoFileDirectory);

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
            const parsedCommand = this.parsedCommandLine;
            if (!parsedCommand) { return undefined; }

            const configFileFullPath = this.configFileFullPath;
            if (!configFileFullPath) { return undefined; }

            const config = TscUtils.readConfigFile(configFileFullPath);
            if (!config) {
                logVerbose(`${this.node.pkg.nameColored}: ts fail to parse ${configFileFullPath}`);
                return undefined;
            }

            // Fix up relative path from the command line based on the package directory
            const commandOptions =
                TscUtils.convertToOptionsWithAbsolutePath(parsedCommand.options, this.node.pkg.directory);

            // Parse the config file relative to the config file directory
            const configDir = path.parse(configFileFullPath).dir;
            const options = ts.parseJsonConfigFileContent(config, ts.sys, configDir, commandOptions, configFileFullPath);

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
            const parsedCommand = this.parsedCommandLine;
            if (!parsedCommand) { return undefined; }

            this._tsConfigFullPath = TscUtils.findConfigFile(this.node.pkg.directory, parsedCommand);
        }
        return this._tsConfigFullPath;
    }

    private get parsedCommandLine() {
        const parsedCommand = TscUtils.parseCommandLine(this.command);
        if (!parsedCommand) {
            logVerbose(`${this.node.pkg.nameColored}: ts fail to parse command line ${this.command}`);
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

        return this.remapOutFile(options, path.parse(configFileFullPath).dir, tsBuildInfoFileName);
    }

    private remapOutFile(options: ts.ParsedCommandLine, directory: string, fileName: string) {
        if (options.options.outDir) {
            if (options.options.rootDir) {
                const relative = path.relative(options.options.rootDir, directory);
                return path.join(options.options.outDir, relative, fileName);
            }
            return path.join(options.options.outDir, fileName);
        }
        return path.join(directory, fileName);
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
                    const tsBuildInfo = JSON.parse(await readFileAsync(tsBuildInfoFileFullPath, "utf8"));
                    if (tsBuildInfo.program && tsBuildInfo.program.fileNames) {
                        this._tsBuildInfo = tsBuildInfo;
                    } else {
                        logVerbose(`${this.node.pkg.nameColored}: Missing program or fileNames property ${tsBuildInfoFileFullPath}`);
                    }
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

    protected get useWorker() {
        // TODO: Worker doesn't implement all mode.  This is not comprehensive filtering yet.
        const parsed = this.parsedCommandLine;
        return parsed !== undefined
            && (parsed.fileNames.length === 0 || parsed.options.project === undefined)
            && !parsed.watchOptions;
    }
}

// Base class for tasks that are dependent on a tsc compile
export abstract class TscDependentTask extends LeafWithDoneFileTask {
    protected tscTasks: TscTask[] = [];
    protected get recheckLeafIsUpToDate() {
        return true;
    }

    protected async getDoneFileContent() {
        try {
            const tsBuildInfoFiles: ITsBuildInfo[] = [];
            for (const tscTask of this.tscTasks) {
                const tsBuildInfo = await tscTask.readTsBuildInfo();
                if (tsBuildInfo === undefined) {
                    // If any of the tsc task don't have build info, we can't track
                    return undefined;
                }
                tsBuildInfoFiles.push(tsBuildInfo);
            }

            const configFile = this.configFileFullPath;
            let config = "";
            if (existsSync(configFile)) {
                // Include the config file if it exists so that we can detect changes
                config = await readFileAsync(this.configFileFullPath, "utf8");
            }

            return JSON.stringify({ tsBuildInfoFiles, config });
        } catch (e) {
            this.logVerboseTask(`error generating done file content ${e}`);
            return undefined;
        }
    }

    protected addDependentTasks(dependentTasks: LeafTask[]) {
        if (this.tscTasks.length === 0) {
            // derived class didn't populate it.
            this.addTscTask(dependentTasks);
        }
    }
    protected addTscTask(dependentTasks: LeafTask[], options?: any) {
        const tscTask = this.addChildTask(dependentTasks, this.node, "tsc", options);
        if (!tscTask) {
            if (options) {
                throw new Error(`${this.node.pkg.nameColored}: Unable to find tsc task matching ${options.tsConfig} for dependent task ${this.command}`);
            } else {
                throw new Error(`${this.node.pkg.nameColored}: Unable to find tsc task for dependent task ${this.command}`);
            }
        }
        this.tscTasks.push(tscTask as TscTask);
        this.logVerboseDependency(this.node, tscTask.command);
    }

    protected abstract get configFileFullPath(): string;
}
