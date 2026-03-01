#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Delegate to the actual fluv bin in the build-tools package.
// This wrapper exists because pnpm requires bin targets to be inside the package directory.
const path = require("path");
const buildToolsBin = path.resolve(__dirname, "../../build-tools/bin/fluv/run.cjs");
require(buildToolsBin);
