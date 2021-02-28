/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ts from "typescript";
import * as TscUtils from "../../tscUtils";
import type { WorkerMessage, WorkerExecResult } from "./worker";

function convertDiagnostics(diagnostics: ts.SortedReadonlyArray<ts.Diagnostic>) {
    const messages: string[] = [];
    diagnostics.forEach(diagnostic => {
        if (diagnostic.file) {
            let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
            let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            messages.push(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
            messages.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
    });
    return messages.join("\n");
}

export async function compile(msg: WorkerMessage): Promise<WorkerExecResult> {
    const { command, cwd } = msg;
    let commandLine = TscUtils.parseCommandLine(command);
    let diagnostics: ts.Diagnostic[] = [];

    if (commandLine) {
        const configFileName = TscUtils.findConfigFile(cwd, commandLine);
        if (configFileName) {
            commandLine = ts.getParsedCommandLineOfConfigFile(
                configFileName,
                commandLine.options,
                {
                    ...ts.sys,
                    getCurrentDirectory: () => cwd,
                    onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => {
                        diagnostics.push(diagnostic);
                    }
                })!;
        } else {
            throw new Error("Unknown config file in commane line");
        }
    }

    let code = ts.ExitStatus.DiagnosticsPresent_OutputsSkipped;
    if (commandLine && diagnostics.length === 0) {
        const incremental = !!(commandLine.options.incremental || commandLine.options.composite);
        const param = {
            rootNames: commandLine.fileNames,
            options: TscUtils.convertToOptionsWithAbsolutePath(commandLine.options, cwd),
            projectReferences: commandLine.projectReferences,
        };
        const program = incremental ?
            ts.createIncrementalProgram(param) :
            ts.createProgram(param);

        diagnostics.push(...program.getConfigFileParsingDiagnostics());
        diagnostics.push(...program.getSyntacticDiagnostics());
        diagnostics.push(...program.getOptionsDiagnostics());
        diagnostics.push(...program.getGlobalDiagnostics());
        diagnostics.push(...program.getSemanticDiagnostics());

        const emitResult = program.emit();
        diagnostics.push(...emitResult.diagnostics);

        if (!emitResult.emitSkipped) {
            code = diagnostics.length !== 0 ? ts.ExitStatus.DiagnosticsPresent_OutputsGenerated : ts.ExitStatus.Success;
        }
    }

    const sortedDiagnostics = ts.sortAndDeduplicateDiagnostics(diagnostics);
    return {
        code,
        stderr: convertDiagnostics(sortedDiagnostics)
    };
}
