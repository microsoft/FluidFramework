#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidRunner } from "../../index.js";

import { fluidExport } from "./sampleCodeLoader.js";

// CommonJS modules may not use await at top level. Catch is best that can be done.
fluidRunner(fluidExport).catch(process.abort);
