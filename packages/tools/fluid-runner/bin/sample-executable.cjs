#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const fluidRunnerModule = require("..//dist/fluidRunner.js");
const sampleCodeLoadeModule = require("../dist/test/sampleCodeLoaders/sampleCodeLoader.js");
fluidRunnerModule.fluidRunner(sampleCodeLoadeModule.fluidExport);
