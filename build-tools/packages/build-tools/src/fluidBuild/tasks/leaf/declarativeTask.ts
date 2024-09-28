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

export class InputOutputTask extends LeafWithFileStatDoneFileTask {
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
		const { inputGlobs } = this.taskDefinition;
		const inputFiles = await globby(inputGlobs, {
			cwd: this.node.pkg.directory,
			// file paths returned from getInputFiles and getOutputFiles should always be absolute
			absolute: true,
			// Ignore gitignored files
			gitignore: true,
		});
		return inputFiles;
	}

	protected async getOutputFiles(): Promise<string[]> {
		const { outputGlobs } = this.taskDefinition;
		const outputFiles = await globby(outputGlobs, {
			cwd: this.node.pkg.directory,
			// file paths returned from getInputFiles and getOutputFiles should always be absolute
			absolute: true,
			// Output files are often gitignored, so we don't want to exclude them like we do for input files
			gitignore: false,
		});
		return outputFiles;
	}
}

export function createDeclarativeTaskHandler(
	// node: BuildPackage,
	// command: string,
	taskDefinition: DeclarativeTask,
	// taskName?: string,
): TaskHandlerFunction {
	const handler: TaskHandlerFunction = (
		node: BuildPackage,
		command: string,
		context: BuildContext,
		taskName?: string,
	): LeafTask => {
		return new InputOutputTask(node, command, context, taskName, taskDefinition);
	};
	return handler;
}
