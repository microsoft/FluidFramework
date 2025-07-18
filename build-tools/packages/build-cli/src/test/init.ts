/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { _dirname } from "./dirname.cjs";

/**
 * Absolute path to the test data. It's rooted two directories up because the tests get executed from lib/test.
 */
export const testDataPath = path.resolve(_dirname, "../../src/test/data");

/**
 * Absolute path to the build-infra test data.
 */
const infraTestDataPath = path.resolve(
	_dirname,
	"../../../build-infrastructure/src/test/data",
);

/**
 * Absolute path to the test repo.
 */
export const testRepoRoot = path.join(infraTestDataPath, "testRepo");
