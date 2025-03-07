/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file must be run after webpack.

// eslint-disable-next-line spaced-comment
/// <reference types="node" />

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const bundle = readFileSync("./dist/debugAssert.js", "utf-8");

assert.match(bundle, /kept 1/);
assert.match(bundle, /kept 2/);
assert.doesNotMatch(bundle, /removed in production/);

console.log("Validated expectation for DebugAsserts");
