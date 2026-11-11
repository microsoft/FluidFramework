/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { register } from "node:module";

import globalJsdom from "global-jsdom";

// Register CSS loader so that CSS imports (e.g. quill-next/dist/quill.snow.css) resolve to empty modules
register("./cssLoader.js", import.meta.url);

// Set up a global JSDOM for rendering the app in tests
globalJsdom();
