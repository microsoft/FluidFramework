/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCommand } from "@oclif/test";
import { afterEach, beforeEach, describe, it } from "mocha";
import { updateReportVersions } from "../../../commands/release/report-unreleased.js";
import type { PrereleaseDetails, ReleaseReport } from "../../../library/release.js";
import { knownReleaseGroups, type ReleaseGroup } from "../../../releaseGroups.js";

const buildVersion = "3.3.0-425246";

function createDetails(version: string, releaseGroup?: ReleaseGroup): PrereleaseDetails {
	return {
		version,
		versionScheme: "semver",
		...(releaseGroup === undefined ? {} : { releaseGroup }),
		ranges: {
			caret: `^${version}`,
			minor: `^${version}`,
			tilde: `~${version}`,
			patch: `~${version}`,
			legacyCompat: `^${version}`,
		},
	};
}

function createReport(): ReleaseReport {
	return {
		"fluid-framework": createDetails("3.2.0", "client"),
		"@fluidframework/tree": createDetails("3.2.0", "client"),
		"@fluidframework/protocol-definitions": createDetails("3.2.0"),
		"@fluidframework/server-routerlicious": createDetails("3.2.0", "server"),
		"@fluidframework/build-common": createDetails("2.0.3"),
	};
}

describe("release:report-unreleased", () => {
	describe("updateReportVersions", () => {
		it("updates only client packages by default, even when other packages have the same version", () => {
			const report = createReport();
			const expected = createReport();
			for (const name of ["fluid-framework", "@fluidframework/tree"]) {
				const details = expected[name];
				assert(details !== undefined);
				details.version = buildVersion;
				details.ranges.caret = buildVersion;
			}

			updateReportVersions(report, buildVersion, undefined);

			assert.deepEqual(report, expected);
		});

		it("updates all target-group entries regardless of their input versions or package names", () => {
			const report = {
				"@fluidframework/tree": createDetails("3.2.0", "client"),
				"@fluidframework/aqueduct": createDetails("3.1.0", "client"),
			};

			updateReportVersions(report, buildVersion, undefined);

			for (const details of Object.values(report)) {
				assert.equal(details.version, buildVersion);
				assert.equal(details.ranges.caret, buildVersion);
			}
		});

		for (const releaseGroup of knownReleaseGroups) {
			it(`updates only the explicit ${releaseGroup} release group`, () => {
				const otherGroup = releaseGroup === "client" ? "server" : "client";
				const report = {
					target: createDetails("3.2.0", releaseGroup),
					other: createDetails("3.2.0", otherGroup),
					independent: createDetails("3.2.0"),
				};
				const expected = structuredClone(report);
				expected.target.version = buildVersion;
				expected.target.ranges.caret = buildVersion;

				updateReportVersions(report, buildVersion, releaseGroup);

				assert.deepEqual(report, expected);
			});
		}

		for (const [name, report] of [
			["an empty report", {}],
			[
				"a report without release-group metadata",
				{ "fluid-framework": createDetails("3.2.0") },
			],
			[
				"a report with only another release group",
				{ server: createDetails("3.2.0", "server") },
			],
		] satisfies [string, ReleaseReport][]) {
			it(`rejects ${name} without changes`, () => {
				const before = structuredClone(report);

				assert.throws(
					() => updateReportVersions(report, buildVersion, undefined),
					/No packages with releaseGroup "client" are defined in the report\./,
				);
				assert.deepEqual(report, before);
			});
		}

		it("rejects a report without the explicitly requested release group", () => {
			const report: ReleaseReport = {
				"fluid-framework": createDetails("3.2.0", "client"),
			};
			const before = structuredClone(report);

			assert.throws(
				() => updateReportVersions(report, buildVersion, "server"),
				/No packages with releaseGroup "server" are defined in the report\./,
			);
			assert.deepEqual(report, before);
		});
	});

	describe("command output", () => {
		let testDir: string;
		let inputPath: string;
		let outDir: string;

		beforeEach(async () => {
			testDir = await mkdtemp(path.join(tmpdir(), "report-unreleased-"));
			inputPath = path.join(testDir, "manifest.full.json");
			outDir = path.join(testDir, "output");
			await mkdir(outDir);
			await writeFile(inputPath, JSON.stringify(createReport()));
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		async function runReport(flags: string[] = []): ReturnType<typeof runCommand> {
			return runCommand(
				[
					"release:report-unreleased",
					"--version",
					buildVersion,
					"--fullReportFilePath",
					inputPath,
					"--outDir",
					outDir,
					"--branchName",
					"refs/heads/release/client/3.3",
					...flags,
				],
				{ root: import.meta.url },
			);
		}

		it("preserves non-client entries in both output formats with the pipeline flags", async () => {
			const { error } = await runReport();
			assert.equal(error, undefined);

			for (const [filename, prefix] of [
				["manifest-425246.json", "^"],
				["simpleManifest-425246.json", ""],
			] as const) {
				assert.deepEqual(JSON.parse(await readFile(path.join(outDir, filename), "utf8")), {
					"fluid-framework": buildVersion,
					"@fluidframework/tree": buildVersion,
					"@fluidframework/protocol-definitions": `${prefix}3.2.0`,
					"@fluidframework/server-routerlicious": `${prefix}3.2.0`,
					"@fluidframework/build-common": `${prefix}2.0.3`,
				});
			}
		});

		it("keeps explicit release-group filtering", async () => {
			const { error } = await runReport(["--releaseGroup", "client"]);
			assert.equal(error, undefined);

			for (const filename of ["manifest-425246.json", "simpleManifest-425246.json"]) {
				assert.deepEqual(JSON.parse(await readFile(path.join(outDir, filename), "utf8")), {
					"fluid-framework": buildVersion,
					"@fluidframework/tree": buildVersion,
				});
			}
		});

		it("does not write manifests when the target release group is missing", async () => {
			await writeFile(
				inputPath,
				JSON.stringify({ "fluid-framework": createDetails("3.2.0") }),
			);

			const { error } = await runReport();

			assert(error instanceof Error);
			assert.match(error.message, /No packages with releaseGroup "client"/);
			assert.deepEqual(await readdir(outDir), []);
		});
	});
});
