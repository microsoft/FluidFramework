/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BuildContext } from "../../buildContext";
import type { BuildPackage } from "../../buildGraph";
import {
	type DeclarativeTask,
	gitignoreDefaultValue,
	replaceRepoRootTokens,
} from "../../fluidBuildConfig";
import type { GitIgnoreSetting } from "../../fluidTaskDefinitions";
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
		return replaceRepoRootTokens(this.taskDefinition.inputGlobs, this.node.context.repoRoot);
	}

	protected async getOutputGlobs(): Promise<readonly string[]> {
		return replaceRepoRootTokens(this.taskDefinition.outputGlobs, this.node.context.repoRoot);
	}
}
