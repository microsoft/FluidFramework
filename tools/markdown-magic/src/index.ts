#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runCli } from "./cli.js";

try {
	await runCli();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
