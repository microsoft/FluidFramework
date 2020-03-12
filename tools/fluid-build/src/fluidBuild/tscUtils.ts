import * as ts from "typescript";
import * as path from "path";

export function parseCommandLine(command: string) {
    // TODO: parse the command line for real, split space for now.
    const args = command.split(" ");

    const parsedCommand = ts.parseCommandLine(args);
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
