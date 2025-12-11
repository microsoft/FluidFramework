/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globby from "globby";
import { getInstalledPackageVersion } from "../taskUtils";
import { TscDependentTask } from "./tscTask";

export class GenerateEntrypointsTask extends TscDependentTask {
	protected get configFileFullPaths() {
		// Add package.json, which tsc should also depend on, but currently doesn't.
		return [this.node.pkg.packageJsonFileName];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("@fluid-tools/build-cli", this.node.pkg.directory);
	}

	protected override async getTaskSpecificOutputFiles(): Promise<string[] | undefined> {
		try {
			const pkgDir = this.node.pkg.directory;

			// Parse command to get output directory and file patterns
			const args = this.command.split(" ");
			let outDir = "./lib"; // default
			let outFilePrefix = "";
			let outFileAlpha: string | undefined = "alpha";
			let outFileBeta: string | undefined = "beta";
			let outFilePublic: string | undefined = "public";
			let outFileLegacyAlpha: string | undefined;
			let outFileLegacyBeta: string | undefined;
			let outFileLegacyPublic: string | undefined;
			const outFileSuffix = ".d.ts";
			let hasNode10TypeCompat = false;

			// Parse command line flags
			for (let i = 0; i < args.length; i++) {
				const arg = args[i];
				if (arg.startsWith("--") && i + 1 < args.length) {
					const value = args[i + 1];
					switch (arg) {
						case "--outDir":
							outDir = value;
							i++;
							break;
						case "--outFilePrefix":
							outFilePrefix = value;
							i++;
							break;
						case "--outFileAlpha":
							outFileAlpha = value === "none" ? undefined : value;
							i++;
							break;
						case "--outFileBeta":
							outFileBeta = value === "none" ? undefined : value;
							i++;
							break;
						case "--outFilePublic":
							outFilePublic = value === "none" ? undefined : value;
							i++;
							break;
						case "--outFileLegacyAlpha":
							outFileLegacyAlpha = value === "none" ? undefined : value;
							i++;
							break;
						case "--outFileLegacyBeta":
							outFileLegacyBeta = value === "none" ? undefined : value;
							i++;
							break;
						case "--outFileLegacyPublic":
							outFileLegacyPublic = value === "none" ? undefined : value;
							i++;
							break;
					}
				} else if (arg === "--node10TypeCompat") {
					hasNode10TypeCompat = true;
				}
			}

			// Build output file patterns
			const outputPatterns: string[] = [];
			const apiLevelFiles = [
				outFileAlpha,
				outFileBeta,
				outFilePublic,
				outFileLegacyAlpha,
				outFileLegacyBeta,
				outFileLegacyPublic,
			];

			for (const apiFile of apiLevelFiles) {
				if (apiFile !== undefined) {
					const basePath = `${outDir}/${outFilePrefix}${apiFile}`;
					outputPatterns.push(`${basePath}${outFileSuffix}`);
					// Also check for .d.cts and .d.mts variants
					outputPatterns.push(`${basePath}.d.cts`);
					outputPatterns.push(`${basePath}.d.mts`);
				}
			}

			// If node10TypeCompat flag is present, also include those files
			if (hasNode10TypeCompat) {
				outputPatterns.push(`${outDir}/**/index.d.ts`);
				outputPatterns.push(`${outDir}/**/index.d.cts`);
				outputPatterns.push(`${outDir}/**/index.d.mts`);
			}

			// Use globby to find actual output files that exist
			const outputFiles = await globby(outputPatterns, {
				cwd: pkgDir,
				absolute: false,
				gitignore: false,
			});

			return outputFiles;
		} catch (e: any) {
			this.traceError(`error getting generate entrypoints output files: ${e.message}`);
			return undefined;
		}
	}
}
