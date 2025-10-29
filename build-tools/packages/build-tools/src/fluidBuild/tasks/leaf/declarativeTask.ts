/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import type { BuildContext } from "../../buildContext";
import type { BuildPackage } from "../../buildGraph";
import {
	type DeclarativeTask,
	type GitIgnoreSetting,
	gitignoreDefaultValue,
} from "../../fluidBuildConfig";
import { LeafWithGlobInputOutputDoneFileTask } from "./leafTask";

export class DeclarativeLeafTask extends LeafWithGlobInputOutputDoneFileTask {
	constructor(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		taskName: string | undefined,
		private readonly taskDefinition: DeclarativeTask,
	) {
		super(node, command, context, taskName);
	}

	/**
	 * Use hashes instead of modified times in donefile.
	 */
	protected override get useHashes(): boolean {
		return true;
	}

	protected override get gitIgnore(): GitIgnoreSetting {
		return this.taskDefinition.gitignore ?? gitignoreDefaultValue;
	}

	protected override get includeLockFiles(): boolean {
		return this.taskDefinition.includeLockFiles ?? super.includeLockFiles;
	}

	protected async getInputGlobs(): Promise<readonly string[]> {
		return this.taskDefinition.inputGlobs;
	}

	protected async getOutputGlobs(): Promise<readonly string[]> {
		return this.taskDefinition.outputGlobs;
	}

	/**
	 * Get cache input files for DeclarativeTask.
	 * Uses the inputGlobs from task definition to determine input files.
	 */
	protected override async getCacheInputFiles(): Promise<string[] | undefined> {
		try {
			// Leverage the existing getInputFiles() method which resolves inputGlobs
			// and includes lock files if configured
			const inputFiles = await this.getInputFiles();

			// Convert to relative paths from package directory
			const pkgDir = this.node.pkg.directory;
			return inputFiles.map((f) => {
				// Files from getInputFiles() might be absolute or relative
				return path.isAbsolute(f) ? path.relative(pkgDir, f) : f;
			});
		} catch (e) {
			this.traceError(`Error getting cache input files: ${e}`);
			return undefined;
		}
	}

	/**
	 * Get cache output files for DeclarativeTask.
	 * Uses the outputGlobs from task definition to determine output files.
	 */
	protected override async getCacheOutputFiles(): Promise<string[] | undefined> {
		try {
			// Leverage the existing getOutputFiles() method which resolves outputGlobs
			const outputFiles = await this.getOutputFiles();

			// Convert to relative paths from package directory
			const pkgDir = this.node.pkg.directory;
			return outputFiles.map((f) => {
				// Files from getOutputFiles() might be absolute or relative
				return path.isAbsolute(f) ? path.relative(pkgDir, f) : f;
			});
		} catch (e) {
			this.traceError(`Error getting cache output files: ${e}`);
			return undefined;
		}
	}
}
