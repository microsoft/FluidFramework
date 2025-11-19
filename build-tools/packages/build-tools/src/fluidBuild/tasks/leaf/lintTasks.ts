/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { existsSync } from "node:fs";

import {
	getEsLintConfigFilePath,
	getInstalledPackageVersion,
	getRecursiveFiles,
} from "../taskUtils";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

export class EsLintTask extends LeafWithFileStatDoneFileTask {
	protected async getInputFiles(): Promise<string[]> {
		// Files which might be linted
		// To be truly correct, this would read the config file, interpret the config, find the projects files, and include those, then include the files from their blobs.
		// This would be difficult with the current config file format, which will also be changing soon, so not worth doing.
		// Assuming all packages have a similar structure, and just lint these files is close enough.
		const lintDirectories = ["src", "tests", "test"];

		const files: string[] = await getRecursiveFiles(
			...lintDirectories
				.map((dir) => path.join(this.node.pkg.directory, dir))
				.filter((dir) => existsSync(dir)),
		);
		// Include config file if present
		const config = getEsLintConfigFilePath(this.node.pkg.directory);
		if (config) {
			files.push(config);
		}

		return files;
	}
	protected async getOutputFiles(): Promise<string[]> {
		return [];
	}

	protected get useWorker() {
		if (this.command === "eslint --format stylish src") {
			// eslint can't use worker thread as it needs to change the current working directory
			return this.node.context.workerPool?.useWorkerThreads === false;
		}
		return false;
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("eslint", this.node.pkg.directory);
	}
}
