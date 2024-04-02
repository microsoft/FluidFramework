#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport } from "./sampleCodeLoader.js";

import { fluidRunner } from "@fluidframework/fluid-runner";

// CommonJS modules may not use await at top level. Catch is best that can be done.
fluidRunner(fluidExport).catch(process.abort);
