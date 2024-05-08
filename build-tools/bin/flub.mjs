#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { execute } from "@oclif/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = pathToFileURL(path.join(__dirname, "../packages/build-cli/bin/run.js"));

await execute({ dir });
