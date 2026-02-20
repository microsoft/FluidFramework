#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In the consolidated build-tools package, the dev entry point is the same as
// the production one since all code is pre-compiled.
import { execute } from "@oclif/core";

await execute({ dir: import.meta.url });
