/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { loadConfiguration } from "./configuration.mjs";
import { safeErrorMessage } from "./errors.mjs";
import { parseCopyOptions } from "./options.mjs";
import { prepareRun } from "./resume.mjs";

try {
	const options = parseCopyOptions(process.argv.slice(2), {
		command: "validate-config.mjs",
		requireExecute: false,
	});
	if (options !== undefined) {
		const { warnings, config, inventory } = await loadConfiguration(options.configPath);
		await prepareRun(config, inventory, options.failedOnly);
		for (const warning of warnings) console.warn(`Warning: ${warning}`);
		console.log("Configuration is valid.");
	}
} catch (error) {
	console.error(`Configuration validation failed: ${safeErrorMessage(error)}`);
	process.exitCode = 1;
}
