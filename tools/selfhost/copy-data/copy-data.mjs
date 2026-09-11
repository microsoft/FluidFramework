#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
	const options = {
		configPath: path.join(import.meta.dirname, "configuration", "parameters", "copy-data.config.json"),
		execute: false,
	};
	for (let index = 0; index < argv.length; index++) {
		switch (argv[index]) {
			case "--config":
				options.configPath = argv[++index];
				if (options.configPath === undefined) throw new Error("Missing value for --config");
				break;
			case "--execute":
				options.execute = true;
				break;
			case "--help":
			case "-h":
					console.log("Usage: node copy-data.mjs --execute [--config <path>]");
				return undefined;
			default:
				throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	if (!options.execute) throw new Error("Pass --execute to create tenants and transfer documents");
	return options;
}

function runScript(scriptPath, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
		child.once("error", () => reject(new Error(`Unable to start ${path.basename(scriptPath)}`)));
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else reject(new Error(`${path.basename(scriptPath)} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`));
		});
	});
}

/** Run the available copy-data phases in dependency order. */
export async function main(argv, run = runScript) {
	const options = parseArgs(argv);
	if (options === undefined) return;
	const configPath = path.resolve(options.configPath);
	const dataCopyDirectory = import.meta.dirname;

	await run(path.join(dataCopyDirectory, "configuration", "validate-config.mjs"), ["--config", configPath]);
	await run(path.join(dataCopyDirectory, "tenant-creation", "tenant-creation.mjs"), ["--config", configPath, "--execute"]);
	await run(path.join(dataCopyDirectory, "document-copy", "copy.mjs"), ["--config", configPath, "--execute"]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? `Data transfer failed: ${error.message}.` : "Data transfer failed.");
		process.exitCode = 1;
	}
}
