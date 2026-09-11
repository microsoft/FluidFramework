/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// @fluid-internal/mocha-test-setup depends on this package, so this package can't reuse mocha-test-setup's
// shared FluidJUnitReporter (packages/test/mocha-test-setup/src/junitReporter.ts) without introducing a
// circular dependency. This is a small, deliberately duplicated copy of the same fix, scoped to this
// package only.
//
// It fixes the `classname` attribute of each `<testcase>` element to be the path (relative to the repo
// root) of the file containing the test, instead of mocha-junit-reporter's default (the test's own
// non-fully-qualified title). Azure DevOps's JUnit importer uses `classname` to populate the "Test file"
// grouping in the Tests tab (see `AutomatedTestStorage` in
// https://github.com/microsoft/azure-pipelines-agent/blob/master/src/Agent.Worker/TestResults/Legacy/JunitResultReader.cs).

const fs = require("node:fs");
const path = require("node:path");
const MochaJUnitReporter = require("mocha-junit-reporter");

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

class FluidJUnitReporter extends MochaJUnitReporter {
	getTestcaseData(test, err) {
		const data = super.getTestcaseData(test, err);
		if (test.file !== undefined) {
			data.testcase[0]._attr.classname = path.relative(repoRoot, test.file);
		}
		return data;
	}
}

module.exports = FluidJUnitReporter;
