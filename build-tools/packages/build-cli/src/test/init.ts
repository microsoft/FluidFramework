/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { _dirname } from "./dirname.cjs";

/**
 * Absolute path to the test data.
 */
const testDataPath = path.resolve(
	_dirname,
	"../../../build-infrastructure/src/test/data",
);
/**
 * Absolute path to the test repo.
 */
export const testRepoRoot = path.join(testDataPath, "testRepo");
