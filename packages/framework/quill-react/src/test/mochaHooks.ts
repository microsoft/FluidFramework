/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import globalJsdom from "global-jsdom";
import type { RootHookObject } from "mocha";

// Set up JSDOM at module load time so Quill can access `document` when test files import it.
// This file is loaded via --require (before spec file discovery) to guarantee correct ordering.
const cleanup = globalJsdom();

/**
 * Mocha Root Hook Plugin. The `beforeAll` hook removes the initial JSDOM before any
 * tests run; individual tests set up their own clean JSDOM via globalJsdom() in beforeEach.
 */
export const mochaHooks: RootHookObject = {
	beforeAll() {
		cleanup();
	},
};
