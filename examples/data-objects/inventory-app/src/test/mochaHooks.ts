/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globalJsdom from "global-jsdom";

// Set up JSDOM before any modules are loaded. Importing @fluidframework/react transitively
// imports Quill, which requires document at import time.
// This file is loaded via Node's --import flag (before Mocha starts) rather than being
// discovered as a spec file, because Mocha loads spec files alphabetically and
// "inventoryApp.test.tsx" ("i") sorts before "mochaHooks.ts" ("m") — meaning the test file
// would be imported first and Quill would load before JSDOM is set up.
// As a consequence, Mocha globals like before() are not available here, to follow the same
// pattern that packages/framework/react uses (and which apparently could break if it gained
// test files that sorted before `mochaHooks.ts` lexicographically).
globalJsdom();
