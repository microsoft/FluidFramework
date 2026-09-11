#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { ConfigurationError, loadConfiguration } from "./configuration.mjs";

function parseArgs(argv) {
	let configPath = path.join(import.meta.dirname, "parameters", "copy-data.config.json");
	for (let index = 0; index < argv.length; index++) {
		switch (argv[index]) {
			case "--config":
				configPath = argv[++index];
				if (configPath === undefined) throw new Error("Missing value for --config");
				break;
			case "--help":
			case "-h":
				console.log("Usage: node validate-config.mjs [--config <path>]");
				return undefined;
			default:
				throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	return configPath;
}

try {
	const configPath = parseArgs(process.argv.slice(2));
	if (configPath !== undefined) {
		const { warnings } = await loadConfiguration(configPath);
		for (const warning of warnings) console.warn(`Warning: ${warning}`);
		console.log("Configuration is valid.");
	}
} catch (error) {
	const message = error instanceof ConfigurationError || error instanceof Error ? error.message : "Configuration validation failed";
	console.error(`Configuration validation failed: ${message}`);
	process.exitCode = 1;
}
