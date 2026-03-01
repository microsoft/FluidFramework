/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { _dirname } from "./dirname.cjs";

export const packageRootPath = path.resolve(_dirname, "../../..");

/**
 * Absolute path to the test data. It's rooted three directories up because the tests get executed from dist/build-infrastructure/test/.
 */
export const testDataPath = path.resolve(
	packageRootPath,
	"src/build-infrastructure/test/data",
);

/**
 * Absolute path to the test repo.
 */
export const testRepoRoot = path.join(testDataPath, "testRepo");
