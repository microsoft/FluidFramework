/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseVersion, VersionBumpType } from "@fluid-tools/version-tools";
import chai, { expect } from "chai";
import assertArrays from "chai-arrays";

// @oclif/test cannot find the path to the project, so as a workaround we configure it explicitly
import { test as oclifTest } from "@oclif/test";
const test = oclifTest.loadConfig({ root: import.meta.url });

import { ReleaseGroup, ReleasePackage } from "../../../src/releaseGroups.js";

chai.use(assertArrays);

interface jsonOutput {
	packageOrReleaseGroup: ReleaseGroup | ReleasePackage;
	title: string;
	tag: string;
	date?: Date;
	releaseType: VersionBumpType;
	version: ReleaseVersion;
	previousVersion?: ReleaseVersion;
	previousTag?: string;
}

describe("flub release fromTag", () => {
	const expected = {
		version: "0.26.1",
		date: "2023-10-26T19:35:13.000Z",
		packageOrReleaseGroup: "build-tools",
		previousTag: "build-tools_v0.26.0",
		previousVersion: "0.26.0",
		releaseType: "patch",
		tag: "build-tools_v0.26.1",
		title: "build-tools v0.26.1 (patch)",
	};

	test
		.stdout()
		.command(["release:fromTag", "build-tools_v0.26.1", "--json"])
		.it(`--json`, (ctx) => {
			const output: jsonOutput = JSON.parse(ctx.stdout);
			// const { title, tag, version } = output;
			expect(output).to.deep.equal(expected);
		});
});
