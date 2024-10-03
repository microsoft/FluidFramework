/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "mocha";

import { NotInGitRepository } from "../errors.js";
import { findGitRootSync, isInGitRepositorySync } from "../utils.js";
import { packageRootPath } from "./init.js";

describe("findGitRootSync", () => {
	it("finds root", () => {
		// This is the path to the current repo, because when tests are executed the working directory is
		const expected = path.resolve(packageRootPath, "../../..");
		const actual = findGitRootSync(process.cwd());
		assert.strictEqual(actual, expected);
	});

	it("throws outside git repo", () => {
		assert.throws(() => {
			findGitRootSync(os.tmpdir());
		}, NotInGitRepository);
	});
});

describe("isInGitRepository", () => {
	it("returns true in repo", () => {
		const testPath = process.cwd();
		const actual = isInGitRepositorySync(testPath);
		assert.strictEqual(actual, true);
	});

	it("returns false outside repo", () => {
		const testPath = os.tmpdir();
		const actual = isInGitRepositorySync(testPath);
		assert.strictEqual(actual, false);
	});
});
