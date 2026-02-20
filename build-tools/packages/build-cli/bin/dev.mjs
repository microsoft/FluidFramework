#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Delegate to the actual flub dev bin in the build-tools package.
// This wrapper exists because pnpm requires bin targets to be inside the package directory.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildToolsBin = path.resolve(__dirname, "../../build-tools/bin/flub/dev.mjs");
await import(buildToolsBin);
