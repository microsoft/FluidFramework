/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// @fluid-internal/mocha-test-setup depends on this package, so this package can't reuse mocha-test-setup's
// shared FluidXunitReporter (packages/test/mocha-test-setup/src/xunitReporter.ts) without introducing a
// circular dependency. This is a small, deliberately duplicated copy of the same fix, scoped to this
// package only.
//
// It's based on mocha's built-in `xunit` reporter and fixes two issues with its default output when many
// packages' reports are viewed together in Azure DevOps's Tests tab:
//
// - `name` (the `<testcase>`'s display title in Azure DevOps): `xunit` sets this to the test's own,
//   non-fully-qualified title, which frequently collides with other tests of the same name defined under
//   different `describe` blocks or files. This override sets it to the fully qualified title instead (the
//   full `describe`/`it` chain), which is unique.
// - `classname` (used by Azure DevOps's JUnit importer to populate the "Test file" grouping — see
//   `AutomatedTestStorage` in
//   https://github.com/microsoft/azure-pipelines-agent/blob/master/src/Agent.Worker/TestResults/Legacy/JunitResultReader.cs):
//   `xunit` sets this to the fully qualified title as well, so that grouping showed test titles instead of
//   file names. This override sets it to the path (relative to the repo root) of the file containing the
//   test.
//
// All other behavior — notably, `xunit`'s single flat `<testsuite>` per report file — is unchanged.

const fs = require("node:fs");
const path = require("node:path");
const MochaXUnitReporter = require("mocha/lib/reporters/xunit");

/**
 * Walks up from `startDir` looking for the repo root, identified by the presence of
 * `pnpm-workspace.yaml`. Falls back to `startDir` if no such ancestor is found.
 */
function findRepoRoot(startDir) {
	let dir = startDir;
	// eslint-disable-next-line no-constant-condition -- terminates via the `parent === dir` root check below
	while (true) {
		if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return startDir;
		}
		dir = parent;
	}
}

const repoRoot = findRepoRoot(process.cwd());

class FluidXunitReporter extends MochaXUnitReporter {
	test(test, options) {
		const classname =
			test.file === undefined ? test.fullTitle() : path.relative(repoRoot, test.file);
		// `xunit`'s `test` method reads `test.title` for `name` and `test.parent.fullTitle()` for
		// `classname`. Wrap `test` and `test.parent` (via prototypal inheritance, so unrelated
		// properties/methods they're relied on for — `file`, `duration`, `state`, `err`, `isPending()`
		// (which recurses into `parent.isPending()`) — still resolve correctly) to present the values
		// wanted here, without mutating the shared `test`/`test.parent` objects that other reporters
		// running in the same `mocha-multi-reporters` process also read.
		const wrappedParent = Object.create(test.parent, {
			fullTitle: { value: () => classname, enumerable: true },
		});
		const wrapped = Object.create(test, {
			title: { value: test.fullTitle(), enumerable: true },
			parent: { value: wrappedParent, enumerable: true },
		});
		super.test(wrapped, options);
	}
}

module.exports = FluidXunitReporter;
