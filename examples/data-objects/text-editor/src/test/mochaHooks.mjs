/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { register } from "node:module";

import globalJsdom from "global-jsdom";

// Set up JSDOM before any modules are loaded (Quill needs document at import time)
globalJsdom();

// Register the CSS loader hook
register("./cssLoader.mjs", import.meta.url);
