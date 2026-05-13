/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { register } from "node:module";

import globalJsdom from "global-jsdom";

// Register CSS loader so that CSS imports (e.g. quill-next/dist/quill.snow.css) resolve to empty modules
register("./cssLoader.js", import.meta.url);

// Set up JSDOM before specs load. app.tsx runs `start()` at module-evaluation time, which
// touches `document` — that happens before any test hook can run, so DOM must already exist.
globalJsdom();
