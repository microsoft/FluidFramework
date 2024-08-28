/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import type * as tsTypes from "typescript";
import { defaultLogger } from "../common/logging.js";
import { getTscUtils, normalizeSlashes } from "./tscUtils.js";

interface TsCompileOptions {
	/**
	 * Complete tsc command line
	 */
	command: string;
	/**
	 * Working directory
	 */
	cwd: string;
	/**
	 * When specified, local package.json will be interpreted as
	 * having "types" property set to this value.
	 */
	packageJsonTypeOverride?: "commonjs" | "module";
}

/**
 * Executes given tsc command line.
 * If command line includes `--watch`, an error will be thrown.
 *
 * @param options - {@link TsCompileOptions}
 * @returns numeric exit code
 */
export function tsCompile(options: TsCompileOptions): number;
/**
 * Executes given tsc command line that may include `--watch`.
 *
 * @param options - {@link TsCompileOptions}
 * @returns numeric exit code when completing immediately or undefined when watch has started
 */
export function tsCompile(
	options: TsCompileOptions,
	allowWatch: "allow-watch",
): number | undefined;
export function tsCompile(
	{ command, cwd, packageJsonTypeOverride }: TsCompileOptions,
	allowWatch?: "allow-watch",
): number | undefined {
	// Load the typescript version that is in the cwd scope
	const tscUtils = getTscUtils(cwd);

	const ts = tscUtils.tsLib;
	let commandLine = tscUtils.parseCommandLine(command);
	let configFileName: string | undefined;
	const currentDirectorySystem = { ...ts.sys, getCurrentDirectory: () => cwd };
	const diagnostics: tsTypes.Diagnostic[] = [];
	if (commandLine) {
		configFileName = tscUtils.findConfigFile(cwd, commandLine);
		if (configFileName) {
			commandLine = ts.getParsedCommandLineOfConfigFile(configFileName, commandLine.options, {
				...currentDirectorySystem,
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
		// When specified, overrides current directory's package.json type field so tsc may cleanly
		// transpile .ts files to CommonJS or ESM using compilerOptions.module Node16 or NodeNext.
		let packageJsonTypeOverrideUsage = "not read" as "not read" | "already present" | "used";
		const applyPackageJsonTypeOverride = !packageJsonTypeOverride
			? undefined
			: (
					host:
						| tsTypes.CompilerHost
						| tsTypes.WatchCompilerHostOfConfigFile<tsTypes.EmitAndSemanticDiagnosticsBuilderProgram>,
				): void => {
					const originalReadFile = host.readFile;
					const packageJsonPath = normalizeSlashes(path.join(cwd, "package.json"));
					host.readFile = (fileName: string) => {
						const rawFile = originalReadFile(fileName);
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
				};

		if (commandLine.options.watch) {
			if (allowWatch !== "allow-watch") {
				throw new Error(
					'--watch option requested from command line, but "allow-watch" not specified.',
				);
			}
			if (!configFileName) {
				throw new Error("A config file is required when --watch option is specified.");
			}

			const host = ts.createWatchCompilerHost(
				configFileName,
				commandLine.options,
				currentDirectorySystem,
				ts.createEmitAndSemanticDiagnosticsBuilderProgram,
			);
			applyPackageJsonTypeOverride?.(host);
			ts.createWatchProgram(host);
			return undefined;
		}

		const incremental = !!(commandLine.options.incremental || commandLine.options.composite);

		const host = incremental
			? ts.createIncrementalCompilerHost(commandLine.options)
			: ts.createCompilerHost(commandLine.options);
		applyPackageJsonTypeOverride?.(host);

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
