/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { register } from "node:module";

import globalJsdom from "global-jsdom";

// Register CSS loader so that CSS imports (e.g. quill/dist/quill.snow.css) resolve to empty modules
register("./cssLoader.js", import.meta.url);

// Set up JSDOM before any modules are loaded (Quill needs document at import time)
globalJsdom();
