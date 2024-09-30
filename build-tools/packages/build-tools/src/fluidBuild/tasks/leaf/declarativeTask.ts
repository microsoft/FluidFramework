/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globby from "globby";

import type { BuildContext } from "../../buildContext";
import type { BuildPackage } from "../../buildGraph";
import type { DeclarativeTask } from "../../fluidBuildConfig";
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

	protected async getInputFiles(): Promise<string[]> {
		const { inputGlobs, gitignore: gitignoreSetting } = this.taskDefinition;

		// Ignore gitignored files if the setting is undefined, since the default is ["input"]. Otherwise check that it
		// includes "input".
		const gitignore: boolean =
			gitignoreSetting === undefined || gitignoreSetting.indexOf("input") !== -1;
		const inputFiles = await globby(inputGlobs, {
			cwd: this.node.pkg.directory,
			// file paths returned from getInputFiles and getOutputFiles should always be absolute
			absolute: true,
			gitignore,
		});
		return inputFiles;
	}

	protected async getOutputFiles(): Promise<string[]> {
		const { outputGlobs, gitignore: gitignoreSetting } = this.taskDefinition;

		const gitignore: boolean = gitignoreSetting?.indexOf("output") !== -1;
		const outputFiles = await globby(outputGlobs, {
			cwd: this.node.pkg.directory,
			// file paths returned from getInputFiles and getOutputFiles should always be absolute
			absolute: true,
			gitignore,
		});
		return outputFiles;
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
