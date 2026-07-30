#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execute, settings } from "@oclif/core";

if (process.env.FLUB_PERF === "1") {
	settings.performanceEnabled = true;
}

await execute({ dir: import.meta.url });
