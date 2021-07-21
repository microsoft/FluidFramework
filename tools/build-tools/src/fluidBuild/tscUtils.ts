/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ts from "typescript";
import * as path from "path";

const defaultTscUtil = getTscUtil(ts);
export const parseCommandLine = defaultTscUtil.parseCommandLine;
export const findConfigFile = defaultTscUtil.findConfigFile;
export const readConfigFile = defaultTscUtil.readConfigFile;

export function convertToOptionsWithAbsolutePath(options: ts.CompilerOptions, cwd: string) {
    // Shallow clone 'CompilerOptions' before modifying.
    const result = { ...options };

    // Expand 'string' properties that potentially contain relative paths.
    for (const key of ["baseUrl", "configFilePath", "declarationDir", "outDir", "rootDir", "project"]) {
        const value = result[key] as string;
        if (value !== undefined) {
            result[key] = path.resolve(cwd, value);
        }
    }

    // Expand 'string[]' properties that potentially contain relative paths.
    for (const key of ["typeRoots"]) {
        const value = result[key] as string[];
        if (value !== undefined) {
            // Note that this also shallow clones the array.
            result[key] = value.map((relative) => path.resolve(cwd, relative));
        }
    }

    return result;
}

export function getTscUtil(tsLib: typeof ts) {
    return {
        parseCommandLine: (command: string) => {
            // TODO: parse the command line for real, split space for now.
            const args = command.split(" ");

            const parsedCommand = tsLib.parseCommandLine(args.slice(1));
            if (parsedCommand.errors.length) {
                return undefined;
            }
            return parsedCommand;
        },

        findConfigFile: (directory: string, parsedCommand: ts.ParsedCommandLine | undefined) => {
            let tsConfigFullPath: string | undefined;
            const project = parsedCommand?.options.project;
            if (project !== undefined) {
                tsConfigFullPath = path.resolve(directory, project);
            } else {
                const foundConfigFile = tsLib.findConfigFile(directory, tsLib.sys.fileExists, "tsconfig.json");
                if (foundConfigFile) {
                    tsConfigFullPath = foundConfigFile;
                } else {
                    tsConfigFullPath = path.join(directory, "tsconfig.json");
                }
            }
            return tsConfigFullPath;
        },

        readConfigFile: (path: string) => {
            const configFile = tsLib.readConfigFile(path, tsLib.sys.readFile);
            if (configFile.error) {
                return undefined;
            }
            return configFile.config;
        },
        convertToOptionsWithAbsolutePath,
    }
};
