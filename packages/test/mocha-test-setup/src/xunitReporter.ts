/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

// Mocha's built-in `xunit` reporter has no dedicated named export; its package has no `exports` map
// restricting deep imports, so it's required the same way `mocha-multi-reporters` resolves a reporter
// given by name (`require("mocha/lib/reporters/xunit")`).
// eslint-disable-next-line import-x/no-internal-modules -- mocha's built-in `xunit` reporter is only reachable via its implementation file; the package exposes no public export for it.
import MochaXUnitReporter from "mocha/lib/reporters/xunit.js";

/**
 * Walks up from `startDir` looking for the repo root, identified by the presence of
 * `pnpm-workspace.yaml`. Falls back to `startDir` if no such ancestor is found (e.g. if the workspace
 * layout ever changes).
 *
 * @remarks Exported (in addition to being used internally) so tests can independently compute the
 * expected `classname` for a given file without duplicating this logic.
 */
export function findRepoRoot(startDir: string): string {
	let dir = startDir;
	// eslint-disable-next-line no-constant-condition -- terminates via the `parent === dir` root check below
	while (true) {
		if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			// Reached the filesystem root without finding a workspace marker.
			return startDir;
		}
		dir = parent;
	}
}

const repoRoot = findRepoRoot(process.cwd());

/**
 * The subset of a Mocha `Test` that {@link FluidXunitReporter} cares about.
 */
interface JUnitTestLike {
	/**
	 * Absolute path of the file the test is defined in, as set by Mocha.
	 */
	file?: string;

	/**
	 * The `Suite` (or nested `Suite`s) the test is defined in. `xunit`'s `test` method relies on
	 * `parent.fullTitle()`, and mocha's own `isPending()` implementation recurses into `parent.isPending()`,
	 * so the whole object (not just `fullTitle`) needs to be preserved when overriding it below.
	 */
	parent: object;

	/**
	 * The test's fully qualified title: its own title, prefixed by its ancestor `describe` blocks' titles.
	 */
	fullTitle(): string;
}

/**
 * Minimal typing for mocha's built-in `xunit` reporter constructor and the `test` instance method
 * {@link FluidXunitReporter} overrides.
 */
interface XUnitReporterInstance {
	test(test: JUnitTestLike, options?: unknown): void;
}

const XUnitReporterCtor = MochaXUnitReporter as unknown as new (
	runner: unknown,
	options: unknown,
) => XUnitReporterInstance;

/**
 * A JUnit reporter for Mocha, based on mocha's built-in `xunit` reporter, that fixes two issues with the
 * default `xunit` output when many packages' reports are viewed together in Azure DevOps's Tests tab.
 *
 * `name` (the `<testcase>`'s display title in Azure DevOps): `xunit` sets this to the test's own,
 * non-fully-qualified title (e.g. `"increments"`), which frequently collides with other tests of the same
 * name defined under different `describe` blocks or files. This override sets it to the fully qualified
 * title instead (the full `describe`/`it` chain), which is unique.
 *
 * `classname` (used by Azure DevOps's JUnit importer to populate the "Test file" grouping — see
 * `AutomatedTestStorage` in
 * {@link https://github.com/microsoft/azure-pipelines-agent/blob/master/src/Agent.Worker/TestResults/Legacy/JunitResultReader.cs | JunitResultReader.cs}):
 * `xunit` sets this to the fully qualified title as well, so that grouping showed test titles instead of
 * file names. This override sets it to the path (relative to the repo root) of the file containing the
 * test.
 *
 * All other behavior — notably, `xunit`'s single flat `<testsuite>` per report file — is unchanged, so
 * this reporter is not subject to the Azure DevOps "Test Run" naming regression that `mocha-junit-reporter`
 * (which emits one `<testsuite>` per `describe` block, rather than one per file) causes: Azure DevOps's
 * JUnit importer falls back to a generic `JUnit_<file name>` run title whenever a report file contains more
 * than one `<testsuite>` element, unconditionally, regardless of file or suite naming.
 */
export class FluidXunitReporter extends XUnitReporterCtor {
	public test(test: JUnitTestLike, options?: unknown): void {
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
		}) as JUnitTestLike["parent"];
		const wrapped = Object.create(test, {
			title: { value: test.fullTitle(), enumerable: true },
			parent: { value: wrappedParent, enumerable: true },
		}) as JUnitTestLike;
		super.test(wrapped, options);
	}
}
