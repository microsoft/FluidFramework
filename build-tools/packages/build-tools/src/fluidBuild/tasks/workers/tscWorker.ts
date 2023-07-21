/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as tsLib from "typescript";

import { getTscUtil } from "../../../common/tscUtils";
import type { WorkerExecResult, WorkerMessage } from "./worker";

export async function compile(msg: WorkerMessage): Promise<WorkerExecResult> {
	const { command, cwd } = msg;
	// Load the typescript version that is in the cwd scope
	const tsPath = require.resolve("typescript", { paths: [cwd] });
	const ts: typeof tsLib = require(tsPath);

	const TscUtils = getTscUtil(ts);

	let commandLine = TscUtils.parseCommandLine(command);
	const diagnostics: tsLib.Diagnostic[] = [];
	if (commandLine) {
		const configFileName = TscUtils.findConfigFile(cwd, commandLine);
		if (configFileName) {
			commandLine = ts.getParsedCommandLineOfConfigFile(configFileName, commandLine.options, {
				...ts.sys,
				getCurrentDirectory: () => cwd,
				onUnRecoverableConfigFileDiagnostic: (diagnostic: tsLib.Diagnostic) => {
					diagnostics.push(diagnostic);
				},
			});
		} else {
			throw new Error("Unknown config file in command line");
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
		const program = incremental ? ts.createIncrementalProgram(param) : ts.createProgram(param);

		diagnostics.push(...program.getConfigFileParsingDiagnostics());
		diagnostics.push(...program.getSyntacticDiagnostics());
		diagnostics.push(...program.getOptionsDiagnostics());
		diagnostics.push(...program.getGlobalDiagnostics());
		diagnostics.push(...program.getSemanticDiagnostics());

		const emitResult = program.emit();
		diagnostics.push(...emitResult.diagnostics);

		if (emitResult.emitSkipped && diagnostics.length > 0) {
			code = ts.ExitStatus.DiagnosticsPresent_OutputsSkipped;
		} else {
			code =
				diagnostics.length !== 0
					? ts.ExitStatus.DiagnosticsPresent_OutputsGenerated
					: ts.ExitStatus.Success;
		}
	}

	if (diagnostics.length > 0) {
		const sortedDiagnostics = ts.sortAndDeduplicateDiagnostics(diagnostics);

		const formatDiagnosticsHost: tsLib.FormatDiagnosticsHost = {
			getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
			getCanonicalFileName: TscUtils.getCanonicalFileName,
			getNewLine: () => ts.sys.newLine,
		};

		// TODO: tsc has more complicated summary than this
		if (commandLine?.options?.pretty !== false) {
			console.log(
				ts.formatDiagnosticsWithColorAndContext(sortedDiagnostics, formatDiagnosticsHost),
			);
			console.log(
				`${ts.sys.newLine}Found ${sortedDiagnostics.length} error${
					sortedDiagnostics.length > 1 ? "s" : ""
				}.`,
			);
		} else {
			console.log(ts.formatDiagnostics(sortedDiagnostics, formatDiagnosticsHost));
		}
	}
	return { code };
}
