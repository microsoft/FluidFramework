/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { tsCompile } from "../../tsCompile.js";
import { fluidTscRegEx } from "../../tscUtils.js";
import type { WorkerExecResult, WorkerMessage } from "./worker.js";

export async function compile(msg: WorkerMessage): Promise<WorkerExecResult> {
	return { code: tsCompile(msg) };
}

export async function fluidCompile(msg: WorkerMessage): Promise<WorkerExecResult> {
	const commandMatch = msg.command.match(fluidTscRegEx);
	if (!commandMatch) {
		throw new Error(`worker command not recognized: ${msg.command}`);
	}
	const command = msg.command.replace(commandMatch[0], "tsc");
	const packageJsonTypeOverride = commandMatch[1] as "commonjs" | "module";
	return { code: tsCompile({ command, cwd: msg.cwd, packageJsonTypeOverride }) };
}
