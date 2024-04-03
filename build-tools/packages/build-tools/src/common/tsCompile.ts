/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as tsTypes from "typescript";
import path from "path";
import { defaultLogger } from "./logging.js";
import { getTscUtils, normalizeSlashes } from "./tscUtils.js";

export function tsCompile({
	command,
	cwd,
	packageJsonTypeOverride,
}: {
	command: string;
	cwd: string;
	packageJsonTypeOverride?: "commonjs" | "module";
}): number {
	// Load the typescript version that is in the cwd scope
	const tscUtils = getTscUtils(cwd);

	const ts = tscUtils.tsLib;
	let commandLine = tscUtils.parseCommandLine(command);
	const diagnostics: tsTypes.Diagnostic[] = [];
	if (commandLine) {
		const configFileName = tscUtils.findConfigFile(cwd, commandLine);
		if (configFileName) {
			commandLine = ts.getParsedCommandLineOfConfigFile(configFileName, commandLine.options, {
				...ts.sys,
				getCurrentDirectory: () => cwd,
				onUnRecoverableConfigFileDiagnostic: (diagnostic: tsTypes.Diagnostic) => {
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

		const host = incremental
			? ts.createIncrementalCompilerHost(commandLine.options)
			: ts.createCompilerHost(commandLine.options);
		// When specified overrides current directory's package.json type field so tsc may cleanly
		// transpile .ts files to CommonJS or ESM using compilerOptions.module Node16 or NodeNext.
		let packageJsonTypeOverrideUsage = "not read" as "not read" | "already present" | "used";
		if (packageJsonTypeOverride) {
			const origReadFile = host.readFile;
			const packageJsonPath = normalizeSlashes(path.join(cwd, "package.json"));
			host.readFile = (fileName: string) => {
				const rawFile = origReadFile(fileName);
				if (fileName === packageJsonPath && rawFile !== undefined) {
					// Reading local package.json: override type field
					const packageJson = JSON.parse(rawFile);
					packageJsonTypeOverrideUsage =
						(packageJson.type ?? "commonjs") !== packageJsonTypeOverride
							? "used"
							: "already present";
					return JSON.stringify({ ...packageJson, type: packageJsonTypeOverride });
				}
				return rawFile;
			};
		}

		const param = {
			rootNames: commandLine.fileNames,
			options: tscUtils.convertOptionPaths(commandLine.options, cwd, path.resolve),
			host,
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

		if (packageJsonTypeOverride && packageJsonTypeOverrideUsage !== "used") {
			defaultLogger.warning(
				`package.json type override set to ${packageJsonTypeOverride} but ${packageJsonTypeOverrideUsage}.`,
			);
		}

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

		const formatDiagnosticsHost: tsTypes.FormatDiagnosticsHost = {
			getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
			getCanonicalFileName: tscUtils.getCanonicalFileName,
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
	return code;
}
