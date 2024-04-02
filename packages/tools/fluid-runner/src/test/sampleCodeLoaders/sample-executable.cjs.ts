#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In practice a caller would import @fluidframework/fluid-runner as seen in the
// ESM version.
// We use relative index.js here per the injected package.json above this file in
// the output folder for dual-emit, that does not have name and exports redefined.
import { fluidRunner } from "../../index.js";

import { fluidExport } from "./sampleCodeLoader.js";

// CommonJS modules may not use await at top level. Catch is best that can be done.
fluidRunner(fluidExport).catch(process.abort);
