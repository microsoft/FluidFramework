#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport } from "./sampleCodeLoader.js";

import { fluidRunner } from "@fluidframework/fluid-runner/internal";

await fluidRunner(fluidExport);
