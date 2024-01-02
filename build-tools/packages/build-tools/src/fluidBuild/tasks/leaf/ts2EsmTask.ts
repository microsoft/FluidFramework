/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as JSON5 from "json5";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TsConfigJson } from "type-fest";
import { globFn } from "../../../common/utils";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

export class Ts2EsmTask extends LeafWithFileStatDoneFileTask {
	/**
	 * Parses the ts2esm command to determine which tsconfigs are used, then reads the input files based on the settings
	 * in the tsconfig `includes` and `files` settings.
	 *
	 * @remarks
	 *
	 * The `excludes` property in tsconfig is NOT USED! This means the cache may look at files that it doesn't need to.
	 */
	protected async getInputFiles(): Promise<string[]> {
		const inputFiles: string[] = [];
		const split = this.command.split(" ");

		// Assume arguments are package-relative paths to tsconfigs
		const configs = split.slice(1).map((filePath) => this.getPackageFileFullPath(filePath));

		for (const configPath of configs) {
			const tsConfig = JSON5.parse(readFileSync(configPath, "utf8")) as TsConfigJson;
			if (tsConfig.files !== undefined) {
				inputFiles.push(...tsConfig.files);
			}
			if (tsConfig.include !== undefined) {
				for (const glob of tsConfig.include) {
					const configDir = path.dirname(configPath);
					const globPaths = await globFn(glob, {
						// We need to interpret the globs from the tsconfig directory
						cwd: configDir,
						// Return absolute paths so we can more easily make them package-relative instead of relative to the
						// tsconfig directory
						absolute: true,
					});
					inputFiles.push(
						// To keep absolute paths out of the cache file, make the path relative to the package
						...globPaths.map((filePath) =>
							path.relative(this.package.directory, filePath),
						),
					);
				}
			}
		}

		// filter out directories
		const filtered = inputFiles.filter((file) => {
			const fileStat = lstatSync(file);
			const isDirectory = fileStat.isDirectory();
			return !isDirectory;
		});

		return filtered;
	}

	protected async getOutputFiles(): Promise<string[]> {
		// Input and output files are the same.
		return this.getInputFiles();
	}
}
