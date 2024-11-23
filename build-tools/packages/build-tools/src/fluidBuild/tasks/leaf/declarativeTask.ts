/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BuildContext } from "../../buildContext";
import type { BuildPackage } from "../../buildGraph";
import {
	type DeclarativeTask,
	type GitIgnoreSetting,
	gitignoreDefaultValue,
} from "../../fluidBuildConfig";
import type { TaskHandlerFunction } from "../taskHandlers";
import { LeafTask, LeafWithGlobInputOutputDoneFileTask } from "./leafTask";

class DeclarativeTaskHandler extends LeafWithGlobInputOutputDoneFileTask {
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

	protected async getInputGlobs(): Promise<string[]> {
		return this.taskDefinition.inputGlobs;
	}

	protected async getOutputGlobs(): Promise<string[]> {
		return this.taskDefinition.outputGlobs;
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
