/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

// `mocha-junit-reporter` ships no type declarations, so it's imported as an untyped value below and
// given a minimal shape via `JUnitReporterCtor`.
import MochaJUnitReporter from "mocha-junit-reporter";

/**
 * Walks up from `startDir` looking for the repo root, identified by the presence of
 * `pnpm-workspace.yaml`. Falls back to `startDir` if no such ancestor is found (e.g. if the workspace
 * layout ever changes).
 */
function findRepoRoot(startDir: string): string {
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
 * The subset of a Mocha `Test`/`Suite`/`Hook` that {@link FluidJUnitReporter} cares about.
 */
interface JUnitTestLike {
	/**
	 * Absolute path of the file the test is defined in, as set by Mocha.
	 */
	file?: string;
}

/**
 * The `<testcase>` xml data produced by `mocha-junit-reporter`'s `getTestcaseData`, in the shape expected
 * by the `xml` npm package it uses internally.
 */
interface JUnitTestcaseData {
	testcase: [
		{
			_attr: {
				name: string;
				time: number;
				classname: string;
			};
		},
	];
}

/**
 * Minimal typing for the `mocha-junit-reporter` constructor and the instance members
 * {@link FluidJUnitReporter} overrides or calls via `super`.
 */
interface JUnitReporterInstance {
	getTestcaseData(test: JUnitTestLike, err?: unknown): JUnitTestcaseData;
}

const JUnitReporterCtor = MochaJUnitReporter as unknown as new (
	runner: unknown,
	options: unknown,
) => JUnitReporterInstance;

/**
 * A JUnit reporter for Mocha, based on `mocha-junit-reporter`, that fixes the `classname` attribute of
 * each `<testcase>` element to be the path (relative to the repository root) of the file containing the
 * test, rather than `mocha-junit-reporter`'s default (the test's own non-fully-qualified title).
 *
 * @remarks
 * Azure DevOps's JUnit importer uses `classname` to populate the "Test file" grouping in the Tests tab
 * (see `AutomatedTestStorage` in
 * {@link https://github.com/microsoft/azure-pipelines-agent/blob/master/src/Agent.Worker/TestResults/Legacy/JunitResultReader.cs | JunitResultReader.cs}).
 * `mocha-junit-reporter` always sets `classname` to the test's own title (see its `getTestcaseData`),
 * which makes that Azure DevOps grouping show test names instead of file names. Setting `classname` to
 * the actual spec file path (relative to the repo root, so it's consistent regardless of which package's
 * directory the test was run from) makes the grouping meaningful again.
 *
 * All other behavior (suite naming, output file naming, etc.) is unchanged from `mocha-junit-reporter`.
 */
export class FluidJUnitReporter extends JUnitReporterCtor {
	public getTestcaseData(test: JUnitTestLike, err?: unknown): JUnitTestcaseData {
		const data = super.getTestcaseData(test, err);
		if (test.file !== undefined) {
			data.testcase[0]._attr.classname = path.relative(repoRoot, test.file);
		}
		return data;
	}
}
