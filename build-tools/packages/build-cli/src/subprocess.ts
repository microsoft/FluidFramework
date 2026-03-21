/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { call, ensure, type Operation } from "effection";
import type { ExecaChildProcess, ExecaReturnValue, Options } from "execa";
import execa from "execa";

/**
 * Runs a command string via `execa.command()` within an effection scope. The subprocess is
 * automatically killed if the scope exits before the process completes (e.g., due to SIGINT or
 * parent task halt).
 *
 * @param command - The command string to execute.
 * @param options - Options passed to `execa.command()`.
 * @returns The execa result.
 */
export function* useExecaCommand(
	command: string,
	options?: Options,
): Operation<ExecaReturnValue> {
	const subprocess: ExecaChildProcess = execa.command(command, options);
	yield* ensure(() => {
		if (!subprocess.killed) {
			subprocess.kill();
		}
	});
	return yield* call(() => subprocess);
}

/**
 * Runs a file with arguments via `execa()` within an effection scope. The subprocess is
 * automatically killed if the scope exits before the process completes.
 *
 * @param file - The file to execute.
 * @param args - Arguments to pass to the file.
 * @param options - Options passed to `execa()`.
 * @returns The execa result.
 */
export function* useExeca(
	file: string,
	args: string[],
	options?: Options,
): Operation<ExecaReturnValue> {
	const subprocess: ExecaChildProcess = execa(file, args, options);
	yield* ensure(() => {
		if (!subprocess.killed) {
			subprocess.kill();
		}
	});
	return yield* call(() => subprocess);
}
