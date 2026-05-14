/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import type * as ts54Types from "typescript-5.4";
import type * as ts59Types from "typescript-5.9";
import { defaultLogger } from "../common/logging.js";
import type { UnionToIntersection } from "./tscUtils.js";
import { getTscUtils, normalizeSlashes } from "./tscUtils.js";

type tsDiagnostic = ts54Types.Diagnostic | ts59Types.Diagnostic;

function castDiagnosticsUnionArrayToIntersection(
	diagnostics: tsDiagnostic[],
): UnionToIntersection<tsDiagnostic>[] {
	return diagnostics as unknown as UnionToIntersection<tsDiagnostic>[];
}

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
	const diagnostics: tsDiagnostic[] = [];
	if (commandLine) {
		configFileName = tscUtils.findConfigFile(cwd, commandLine);
		if (configFileName) {
			commandLine = ts.getParsedCommandLineOfConfigFile(
				configFileName,
				tscUtils.castOptionsUnionToIntersection(commandLine.options),
				{
					...currentDirectorySystem,
					onUnRecoverableConfigFileDiagnostic: (diagnostic: tsDiagnostic) => {
						diagnostics.push(diagnostic);
					},
				},
			);
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
						| ts54Types.CompilerHost
						| ts59Types.CompilerHost
						| ts54Types.WatchCompilerHostOfConfigFile<ts54Types.EmitAndSemanticDiagnosticsBuilderProgram>
						| ts59Types.WatchCompilerHostOfConfigFile<ts59Types.EmitAndSemanticDiagnosticsBuilderProgram>,
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

		// The remainder of this block mostly uses a single version of TypeScript - a base
		// version that is meant to represent the earliest supported version. `ts` should
		// be used directly when allowed.
		const baseTs = tscUtils.baseTs(ts);

		if (commandLine.options.watch) {
			if (allowWatch !== "allow-watch") {
				throw new Error(
					'--watch option requested from command line, but "allow-watch" not specified.',
				);
			}
			if (!configFileName) {
				throw new Error("A config file is required when --watch option is specified.");
			}

			const host = baseTs.createWatchCompilerHost(
				configFileName,
				tscUtils.castOptionsUnionToIntersection(commandLine.options),
				currentDirectorySystem,
				baseTs.createEmitAndSemanticDiagnosticsBuilderProgram,
			);
			applyPackageJsonTypeOverride?.(host);
			baseTs.createWatchProgram(host);
			return undefined;
		}

		const incremental = !!(commandLine.options.incremental || commandLine.options.composite);

		// baseTs is used here so that host is a specific version and can be passed to .create*Program params below.
		const host = incremental
			? baseTs.createIncrementalCompilerHost(
					tscUtils.castOptionsUnionToIntersection(commandLine.options),
				)
			: baseTs.createCompilerHost(
					tscUtils.castOptionsUnionToIntersection(commandLine.options),
				);
		applyPackageJsonTypeOverride?.(host);

		const param = {
			rootNames: commandLine.fileNames,
			options: tscUtils.castOptionsUnionToIntersection(
				tscUtils.convertOptionPaths(commandLine.options, cwd, path.resolve),
			),
			host,
			projectReferences: commandLine.projectReferences,
		};
		const program = incremental
			? baseTs.createIncrementalProgram(param)
			: baseTs.createProgram(param);

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
		const sortedDiagnostics = tscUtils
			.baseTs(ts)
			.sortAndDeduplicateDiagnostics(castDiagnosticsUnionArrayToIntersection(diagnostics));

		const formatDiagnosticsHost:
			| ts54Types.FormatDiagnosticsHost
			| ts59Types.FormatDiagnosticsHost = {
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
