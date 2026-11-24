/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeErrorMessage, StageError } from "./configuration/errors.mjs";
import { parseCopyOptions } from "./configuration/options.mjs";

function runScript(scriptPath, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
		child.once("error", () =>
			reject(new StageError(`Unable to start ${path.basename(scriptPath)}`)),
		);
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else
				reject(
					new StageError(
						`${path.basename(scriptPath)} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
					),
				);
		});
	});
}

/** Run the available copy-data phases in dependency order. */
export async function main(argv, run = runScript) {
	const options = parseCopyOptions(argv);
	if (options === undefined) return;
	const configPath = path.resolve(options.configPath);
	const dataCopyDirectory = import.meta.dirname;

	await run(path.join(dataCopyDirectory, "configuration", "validate-config.mjs"), [
		"--config",
		configPath,
		...(options.failedOnly ? ["--failed-only", options.failedOnly] : []),
	]);
	await run(path.join(dataCopyDirectory, "configuration", "check-deployment.mjs"), [
		"--config",
		configPath,
	]);
	await run(path.join(dataCopyDirectory, "tenant-creation", "tenant-creation.mjs"), [
		"--config",
		configPath,
		"--execute",
	]);
	await run(path.join(dataCopyDirectory, "document-copy", "copy.mjs"), [
		"--config",
		configPath,
		"--execute",
		...options.copyArgs,
	]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(`Data copy failed: ${safeErrorMessage(error)}`);
		process.exitCode = 1;
	}
}
