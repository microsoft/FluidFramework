/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globby from "globby";

import type { BuildContext } from "../../buildContext";
import type { BuildPackage } from "../../buildGraph";
import {
	type DeclarativeTask,
	type GitIgnoreSettingValue,
	gitignoreDefaultValue,
} from "../../fluidBuildConfig";
import type { TaskHandlerFunction } from "../taskHandlers";
import { LeafTask, LeafWithFileStatDoneFileTask } from "./leafTask";

class DeclarativeTaskHandler extends LeafWithFileStatDoneFileTask {
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
	protected get useHashes(): boolean {
		return true;
	}

	/**
	 * Gets all the input or output files for the task based on the globs configured for that task.
	 *
	 * @param mode - Whether to use the input or output globs.
	 * @returns An array of absolute paths to all files that match the globs.
	 */
	private async getFiles(mode: GitIgnoreSettingValue): Promise<string[]> {
		const { inputGlobs, outputGlobs, gitignore: gitignoreSetting } = this.taskDefinition;
		const globs = mode === "input" ? inputGlobs : outputGlobs;
		const gitignoreSettingRealized = gitignoreSetting ?? gitignoreDefaultValue;
		const excludeGitIgnoredFiles: boolean = gitignoreSettingRealized.includes(mode);

		const files = await globby(globs, {
			cwd: this.node.pkg.directory,
			// file paths returned from getInputFiles and getOutputFiles should always be absolute
			absolute: true,
			gitignore: excludeGitIgnoredFiles,
		});
		return files;
	}

	protected async getInputFiles(): Promise<string[]> {
		return this.getFiles("input");
	}

	protected async getOutputFiles(): Promise<string[]> {
		return this.getFiles("output");
	}
}

/**
 * Generates a task handler for a declarative task dynamically.
 *
 * @param taskDefinition - The declarative task definition.
 * @returns a function that can be used to instantiate a LeafTask to handle a task.
 */
export function createDeclarativeTaskHandler(
	taskDefinition: DeclarativeTask,
): TaskHandlerFunction {
	const handler: TaskHandlerFunction = (
		node: BuildPackage,
		command: string,
		context: BuildContext,
		taskName?: string,
	): LeafTask => {
		return new DeclarativeTaskHandler(node, command, context, taskName, taskDefinition);
	};
	return handler;
}
