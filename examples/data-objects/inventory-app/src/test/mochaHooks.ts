/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globalJsdom from "global-jsdom";

// Set up JSDOM before any modules are loaded (Quill requires document at import time).
// This file is loaded via Node's --import flag (before Mocha starts), so mocha globals
// like before() are not available here.
globalJsdom();
