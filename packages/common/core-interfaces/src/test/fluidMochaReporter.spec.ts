/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This test mirrors the relevant output assertions in
// mocha-test-setup/src/test/xunitReporter.spec.ts for the duplicated reporter implementation in this
// package. Keep the two test suites aligned when changing the reporters.

import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// eslint-disable-next-line import-x/no-internal-modules -- Mocha's programmatic API is exposed by its default export, not a separate entrypoint.
import Mocha from "mocha";

describe("FluidMochaReporter", () => {
	it("produces fully qualified names and repo-relative classnames through the package's multi-reporter configuration", async () => {
		const fixtureDir = mkdtempSync(path.join(tmpdir(), "fluid-mocha-reporter-test-"));
		const fixtureFile = path.join(fixtureDir, "reporter.fixture.cjs");
		const reportId = `fluid-mocha-reporter-test-${process.pid}-`;
		const reportFile = path.resolve("nyc", `${reportId}junit-report.xml`);

		try {
			writeFileSync(
				fixtureFile,
				`describe("fixture suite", function () {
					it("fixture test", function () {});
				});
				`,
			);

			const mocha = new Mocha({
				reporter: "mocha-multi-reporters",
				reporterOptions: {
					configFile: path.resolve("test-config.json"),
					cmrOutput: [
						`./FluidMochaReporter.cjs+output+${reportId}`,
						"./FluidMochaReporter.cjs+suiteName+reporter integration test",
					].join(":"),
				},
			});
			mocha.addFile(fixtureFile);
			await mocha.loadFilesAsync();

			const failures = await new Promise<number>((resolve) => {
				mocha.run(resolve);
			});
			assert.equal(failures, 0);

			const reportXml = readFileSync(reportFile, "utf8");
			assert.match(reportXml, /<testcase\b[^>]*\bname="fixture suite fixture test"/);
			const expectedClassname = path.relative(path.resolve("..", "..", ".."), fixtureFile);
			assert.ok(
				reportXml.includes(`classname="${expectedClassname}"`),
				`expected classname '${expectedClassname}'`,
			);
		} finally {
			rmSync(fixtureDir, { recursive: true, force: true });
			rmSync(reportFile, { force: true });
		}
	});
});
