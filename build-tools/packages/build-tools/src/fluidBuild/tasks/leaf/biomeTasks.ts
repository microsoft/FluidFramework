/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import globby from "globby";
import ignore from "ignore";
import {
	getAllBiomeConfigPaths,
	getSettingValuesFromBiomeConfig,
	loadBiomeConfig,
} from "../../../common/biomeConfig";
import { getResolvedFluidRoot } from "../../../common/fluidUtils";
// import type { Configuration as BiomeConfig } from "../../../common/biomeConfig";
import { GitRepo } from "../../../common/gitRepo";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

// switch to regular import once building ESM
const findUp = import("find-up");

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
