/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ts from "typescript";
import * as path from "path";

export function parseCommandLine(command: string) {
    // TODO: parse the command line for real, split space for now.
    const args = command.split(" ");

    const parsedCommand = ts.parseCommandLine(args.slice(1));
    if (parsedCommand.errors.length) {
        return undefined;
    }
    return parsedCommand;
}

export function findConfigFile(directory: string, parsedCommand: ts.ParsedCommandLine | undefined) {
    let tsConfigFullPath: string | undefined;
    const project = parsedCommand?.options.project;
    if (project !== undefined) {
        tsConfigFullPath = path.resolve(directory, project);
    } else {
        const foundConfigFile = ts.findConfigFile(directory, ts.sys.fileExists, "tsconfig.json");
        if (foundConfigFile) {
            tsConfigFullPath = foundConfigFile;
        } else {
            tsConfigFullPath = path.join(directory, "tsconfig.json");
        }
    }
    return tsConfigFullPath;
}

export function readConfigFile(path: string) {
    const configFile = ts.readConfigFile(path, ts.sys.readFile);
    if (configFile.error) {
        return undefined;
    }
    return configFile.config;
}

export function convertToOptionsWithAbsolutePath(options: ts.CompilerOptions, cwd: string) {
    const result = { ...options };
    for (const key of ["configFilePath", "declarationDir", "outDir", "rootDir", "project"]) {
        const value = result[key] as string;
        if (value !== undefined) {
            result[key] = path.resolve(cwd, value);
        }
    }
    return result;
}
