#!/usr/bin/env -S node --loader ts-node/esm --no-warnings=ExperimentalWarning
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execute, settings } from "@oclif/core";

if (process.env.FLUB_PERF === "1") {
	settings.performanceEnabled = true;
}

await execute({ development: true, dir: import.meta.url });
