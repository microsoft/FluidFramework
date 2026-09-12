/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// eslint-disable-next-line import-x/no-internal-modules -- `Mocha.Suite`/`Mocha.Test` are only reachable via the package's default export; there is no separate named-export entrypoint for them.
import Mocha from "mocha";

import { findRepoRoot, FluidXunitReporter } from "../xunitReporter.js";

/**
 * `mocha-multi-reporters` (and thus every CJS-variant test run in this repo, i.e. anything run with
 * `FLUID_TEST_MODULE_SYSTEM=CJS`) loads this package's reporter via a plain CommonJS `require()` of
 * {@link file://../../xunit-reporter-cjswrapper.cjs}, not via the ESM import used above. Loading it the
 * same way here (rather than just re-using the `FluidXunitReporter` already imported above) ensures that
 * real-world path - and the wrapper file itself - are actually exercised by these tests.
 */
const requireFromHere = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the `.cjs` wrapper has no type declarations of its own; it re-exports `FluidXunitReporter` as its module.exports default.
const FluidXunitReporterViaCjsWrapper: typeof FluidXunitReporter = requireFromHere(
	"../../xunit-reporter-cjswrapper.cjs",
);

/**
 * Runs mocha, with the given reporter, against a small suite of tests defined in on-disk fixture
 * files, and returns the JUnit report it writes plus the fixture files' paths.
 *
 * @remarks
 * The fixture files are deliberately written to a temp directory outside the repo's own `lib/test` output
 * (rather than alongside this spec file), so they aren't themselves picked up as tests by this package's
 * own top-level mocha run.
 *
 * Two of the fixture tests share a leaf `it()` title across different `describe` blocks/files -
 * the exact collision pattern {@link FluidXunitReporter} exists to disambiguate (see its doc comment).
 */
async function runFixtureSuite(reporter: typeof FluidXunitReporter): Promise<{
	reportXml: string;
	fixtureDir: string;
	fileA: string;
	fileB: string;
}> {
	const fixtureDir = mkdtempSync(path.join(tmpdir(), "fluid-xunit-reporter-test-"));
	const fileA = path.join(fixtureDir, "suiteA.fixture.cjs");
	const fileB = path.join(fixtureDir, "suiteB.fixture.cjs");

	writeFileSync(
		fileA,
		`describe("suite A", function () {
			it("does the thing", function () {});
		});
		`,
	);
	writeFileSync(
		fileB,
		`describe("suite B", function () {
			it("does the thing", function () {});
			it("is skipped", function () {
				this.skip();
			});
			it("fails", function () {
				throw new Error("boom");
			});
		});
		`,
	);

	const outputFile = path.join(fixtureDir, "junit-report.xml");
	const mocha = new Mocha({
		reporter: reporter as unknown as string,
		reporterOptions: { output: outputFile, suiteName: "fixture-suite" },
	});
	mocha.addFile(fileA);
	mocha.addFile(fileB);
	await mocha.loadFilesAsync();

	await new Promise<void>((resolve) => {
		mocha.run(() => resolve());
	});

	const reportXml = readFileSync(outputFile, "utf8");
	return { reportXml, fixtureDir, fileA, fileB };
}

/**
 * Runs the shared fixture-suite assertions against the given reporter (either imported directly as ESM,
 * or loaded via the CommonJS wrapper `mocha-multi-reporters` actually uses at runtime).
 */
function describeFixtureSuiteBehavior(reporter: typeof FluidXunitReporter): void {
	describe("with tests loaded from files", () => {
		let reportXml: string;
		let fixtureDir: string;
		let fileA: string;
		let fileB: string;

		before(async () => {
			({ reportXml, fixtureDir, fileA, fileB } = await runFixtureSuite(reporter));
		});

		after(() => {
			rmSync(fixtureDir, { recursive: true, force: true });
		});

		it("produces a well-formed, non-truncated report with a single <testsuite>", () => {
			// This is a regression test for a real incident: an earlier, buggy version of this
			// reporter's `test()` override crashed inside a mocha-internal event handler (because
			// `test.parent.isPending` was undefined on a bare wrapper object used to override
			// `classname`), which silently truncated the output file mid-write - with no visible
			// error and a misleading exit code of 0. Asserting the file is well-formed guards
			// against that class of bug recurring.
			const testsuiteMatches = [...reportXml.matchAll(/<testsuite\b/g)];
			assert.equal(testsuiteMatches.length, 1);
			assert.match(reportXml.trim(), /<\/testsuite>$/);
		});

		it("sets each <testcase>'s name to its fully qualified title, disambiguating same-named tests", () => {
			const names = [...reportXml.matchAll(/<testcase\b[^>]*\bname="([^"]*)"/g)].map(
				(match) => match[1],
			);
			assert.deepEqual(
				[...names].sort(),
				[
					"suite A does the thing",
					"suite B does the thing",
					"suite B is skipped",
					"suite B fails",
				].sort(),
			);
		});

		it("sets each <testcase>'s classname to its spec file's path, relative to the repo root", () => {
			const repoRoot = findRepoRoot(process.cwd());
			const expectedClassnameA = path.relative(repoRoot, fileA);
			const expectedClassnameB = path.relative(repoRoot, fileB);

			const classnames = [...reportXml.matchAll(/<testcase\b[^>]*\bclassname="([^"]*)"/g)].map(
				(match) => match[1],
			);
			assert.ok(classnames.length > 0);
			for (const classname of classnames) {
				assert.ok(
					classname === expectedClassnameA || classname === expectedClassnameB,
					`unexpected classname: ${classname}`,
				);
			}
		});

		it("still records failed and skipped tests, matching xunit's default behavior", () => {
			assert.match(reportXml, /<failure>/);
			assert.match(reportXml, /<skipped\/>/);
		});
	});

	it("falls back to the fully qualified title as the classname when the test has no file", async () => {
		const fixtureDir = mkdtempSync(path.join(tmpdir(), "fluid-xunit-reporter-test-"));
		const outputFile = path.join(fixtureDir, "junit-report.xml");
		try {
			const mocha = new Mocha({
				reporter: reporter as unknown as string,
				reporterOptions: { output: outputFile, suiteName: "fixture-suite" },
			});
			// Built directly via mocha's own `Suite`/`Test` classes (rather than loaded from a file),
			// so `test.file` is never set - exercising the fallback branch in `FluidXunitReporter`.
			const suite = Mocha.Suite.create(mocha.suite, "suite with no file");
			suite.addTest(new Mocha.Test("does something", () => {}));

			await new Promise<void>((resolve) => {
				mocha.run(() => resolve());
			});

			const reportXml = readFileSync(outputFile, "utf8");
			assert.match(
				reportXml,
				/<testcase\b[^>]*\bclassname="suite with no file does something"/,
			);
		} finally {
			rmSync(fixtureDir, { recursive: true, force: true });
		}
	});
}

describe("FluidXunitReporter", () => {
	describeFixtureSuiteBehavior(FluidXunitReporter);
});

describe("FluidXunitReporter, loaded via the CommonJS wrapper (as mocha-multi-reporters does)", () => {
	it("is the same class exported by the ESM module", () => {
		assert.equal(FluidXunitReporterViaCjsWrapper, FluidXunitReporter);
	});

	describeFixtureSuiteBehavior(FluidXunitReporterViaCjsWrapper);
});
