#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildToolsBin = path.resolve(__dirname, "../../build-tools/bin/flub/run.mjs");
await import(buildToolsBin);
