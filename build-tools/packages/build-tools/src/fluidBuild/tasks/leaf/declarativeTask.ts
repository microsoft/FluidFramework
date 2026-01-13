/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BuildContext } from "../../buildContext.js";
import type { BuildPackage } from "../../buildGraph.js";
import {
	type DeclarativeTask,
	type GitIgnoreSetting,
	gitignoreDefaultValue,
} from "../../fluidBuildConfig.js";
import { LeafWithGlobInputOutputDoneFileTask } from "./leafTask.js";

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
}
