/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { readFile } from "fs/promises";
import globby from "globby";
import ignore from "ignore";
import * as JSON5 from "json5";
import { merge } from "ts-deepmerge";
import { getResolvedFluidRoot } from "../../../common/fluidUtils";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

// switch to regular import once building ESM
const findUp = import("find-up");

/**
 * A type defining the Biome config file. Only the fields we care about are included.
 *
 * @privateRemarks
 *
 * Biome does have a JSON schema for the config format, so in the future if we need more comprehensive config file
 * handling, this should be updated to use the schema instead.
 */
interface BiomeConfig {
	extends?: string[];
	files?: {
		include?: string[];
		ignore?: string[];
	};
	formatter?: {
		include?: string[];
		ignore?: string[];
	};
	linter?: {
		include?: string[];
		ignore?: string[];
	};
}

/**
 * This task enables incremental build support for Biome formatting tasks. It reads Biome configuration files to load
 * the 'include' and 'ignore' settings, and will not consider other files when checking if the task needs to run.
 *
 * The task will consider the 'extends' value and load nested Biome configs. The configs will be merged, but array-type
 * settings like 'includes' and 'ignores' are not merged - the top-most config wins for such keys.
 *
 * In addition, .gitignored paths will be excluded. Internally the task uses git itself to enumerate files.
 */
export class BiomeTask extends LeafWithFileStatDoneFileTask {
	// performance note: having individual tasks each acquire repo root and GitRepo
	// is quite inefficient. recommend passing such common things in a context object
	// to task constructors.
	private readonly repoRoot = getResolvedFluidRoot(true);
	private readonly gitRepo = this.repoRoot.then((repoRoot) => new GitRepo(repoRoot));

	/**
	 * Use hashes instead of modified times in donefile.
	 */
	protected get useHashes(): boolean {
		return true;
	}

	/**
	 * Includes all files in the the task's package directory that Biome would format and any Biome config files that
	 * apply to the directory. Files ignored by git are excluded.
	 */
	protected async getInputFiles(): Promise<string[]> {
		// Absolute paths to files that would be formatted by biome.
		const files = await this.getBiomeFormattedFiles(this.node.pkg.directory);
		const configPath = await this.getClosestBiomeConfigPath(this.node.pkg.directory);

		if (configPath === undefined) {
			// No configs to include, so just return all formatted files
			return [...new Set(files)];
		}

		const allConfigPaths = await getAllBiomeConfigPaths(configPath);
		return [...new Set([...allConfigPaths, ...files])];
	}

	protected async getOutputFiles(): Promise<string[]> {
		// Input and output files are the same.
		return this.getInputFiles();
	}

	/**
	 * Returns the absolute path to the closest Biome config file found from the current working directory up to the root
	 * of the repo.
	 */
	private async getClosestBiomeConfigPath(cwd: string): Promise<string | undefined> {
		return (await findUp)
			.findUp(["biome.json", "biome.jsonc"], { cwd, stopAt: await this.repoRoot })
			.then((config) => {
				if (config === undefined) {
					this.traceError(`Can't find biome config file`);
				}
				return config;
			});
	}

	/**
	 * Return an array of absolute paths to files that Biome would format under the provided path.
	 */
	private async getBiomeFormattedFiles(pkgDir: string): Promise<string[]> {
		const gitRepo = await this.gitRepo;

		/**
		 * All files that could possibly be formatted before ignore entries are applied. Paths are relative to the root of
		 * the repo.
		 */
		const allPossibleFiles = new Set(await gitRepo.getFiles(pkgDir));

		const configFile = await this.getClosestBiomeConfigPath(pkgDir);
		if (configFile === undefined) {
			// No config, so all files are formatted
			return [...allPossibleFiles];
		}

		const config = await loadBiomeConfig(configFile);
		const [includeEntries, ignoreEntries] = await Promise.all([
			getSettingValuesFromBiomeConfig(config, "formatter", "include"),
			getSettingValuesFromBiomeConfig(config, "formatter", "ignore"),
		]);

		// From the Biome docs (https://biomejs.dev/guides/how-biome-works/#include-and-ignore-explained):
		//
		// "At the moment, Biome uses a glob library that treats all globs as having a **/ prefix.
		// This means that src/**/*.js and **/src/**/*.js are treated as identical. They match both src/file.js and
		// test/src/file.js. This is something we plan to fix in Biome v2.0.0."
		const prefixedIncludes = [...includeEntries].map((glob) => `**/${glob}`);

		/**
		 * An array of package-relative paths to files included via the 'include' settings in the Biome config.
		 */
		const includedPaths = await globby(prefixedIncludes, {
			// We need to interpret the globs from the provided directory; the paths returned will be relative to this path
			cwd: pkgDir,

			// Don't return directories, only files; Biome includes are only applied to files.
			// See note at https://biomejs.dev/guides/how-biome-works/#include-and-ignore-explained
			onlyFiles: true,
		});

		const ignoreObject = ignore().add([...ignoreEntries]);
		const filtered = ignoreObject.filter([...includedPaths]);

		this.traceExec(
			`Biome formatter found ${allPossibleFiles.size} total files, included ${includedPaths.length}, and reduced to ${filtered.length} files by ignore settings.`,
		);

		// Convert package-relative paths to absolute
		const repoRoot = await this.repoRoot;
		return filtered.map((filePath) => path.resolve(repoRoot, pkgDir, filePath));
	}
}

/**
 * Loads a Biome configuration file _without_ following any 'extends' values. You probably want to use
 * {@link loadBiomeConfig} instead of this function.
 */
async function loadRawBiomeConfig(configPath: string): Promise<BiomeConfig> {
	const contents = await readFile(configPath, "utf8");
	const config: BiomeConfig = JSON5.parse(contents);
	return config;
}

/**
 * Returns an array of absolute paths to Biome config files. The paths are in the order in which they are merged by
 * Biome. That is, the last item in the array will be the absolute path to `configPath`.
 */
async function getAllBiomeConfigPaths(configPath: string): Promise<string[]> {
	const config = await loadRawBiomeConfig(configPath);
	let extendedConfigPaths: string[] = [];

	if (config.extends) {
		const pathsNested = await Promise.all(
			config.extends.map((configToExtend) =>
				getAllBiomeConfigPaths(path.join(path.dirname(configPath), configToExtend)),
			),
		);
		extendedConfigPaths = pathsNested.flat();
	}

	// Add the current config as the last one to be applied when they're merged
	extendedConfigPaths.push(configPath);
	return extendedConfigPaths;
}

/**
 * Loads a Biome configuration file. If the config extends others, then those are loaded recursively and the results are
 * merged. Array-type values are not merged, in accordance with how Biome applies configs.
 *
 * @remarks
 *
 * The intent is to merge the configs in the same way that Biome itself does, but the implementation is based on the
 * Biome documentation, so there may be subtle differences unaccounted for. Where this implementation diverges from
 * Biome's behavior, this function should be considered incorrect.
 *
 */
async function loadBiomeConfig(configPath: string): Promise<BiomeConfig> {
	const allConfigPaths = await getAllBiomeConfigPaths(configPath);
	const allConfigs = await Promise.all(
		allConfigPaths.map((pathToConfig) => loadRawBiomeConfig(pathToConfig)),
	);

	const mergedConfig = merge.withOptions(
		{
			// Biome does not merge arrays
			mergeArrays: false,
		},
		...allConfigs,
	);

	return mergedConfig;
}

type BiomeIncludeIgnore = "include" | "ignore";
type BiomeConfigSection = "formatter" | "linter";

/**
 * Given a Biome config object, returns the combined settings for 'ignore' and 'include' across the 'files', 'formatter'
 * and 'linter' sections in the config.
 */
async function getSettingValuesFromBiomeConfig(
	config: BiomeConfig,
	section: BiomeConfigSection,
	kind: BiomeIncludeIgnore,
): Promise<Set<string>> {
	if (section === "formatter" && kind === "ignore") {
		const filesIgnore = config.files?.ignore ?? [];
		const formatterIgnores = config.formatter?.ignore ?? [];
		return new Set([...filesIgnore, ...formatterIgnores]);
	}

	if (section === "formatter" && kind === "include") {
		const filesInclude = config.files?.include ?? [];
		const formatterIncludes = config.formatter?.include ?? [];
		return new Set([...filesInclude, ...formatterIncludes]);
	}

	if (section === "linter" && kind === "ignore") {
		const filesIgnore = config.files?.ignore ?? [];
		const linterIgnores = config.linter?.ignore ?? [];
		return new Set([...filesIgnore, ...linterIgnores]);
	}

	if (section === "linter" && kind === "include") {
		const filesInclude = config.files?.include ?? [];
		const linterIncludes = config.linter?.include ?? [];
		return new Set([...filesInclude, ...linterIncludes]);
	}

	return new Set<string>();
}
