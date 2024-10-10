/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it } from "mocha";

import { NotInGitRepository } from "../errors.js";
import { findGitRootSync } from "../utils.js";

import { packageRootPath } from "./init.js";

describe("findGitRootSync", () => {
	it("finds root", () => {
		// This is the path to the current repo, because when tests are executed the working directory is
		// the root of this package: build-tools/packages/build-infrastructure
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
