/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseVersion, VersionBumpType } from "@fluid-tools/version-tools";
import { runCommand } from "@oclif/test";
import { describe, expect, it } from "vitest";

import { ReleaseGroup, ReleasePackage } from "../../../releaseGroups.js";

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

	it("--json", async () => {
		const { stdout } = await runCommand(["release:fromTag", "build-tools_v0.26.1", "--json"], {
			root: import.meta.url,
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const output: jsonOutput = JSON.parse(stdout);
		expect(output).to.deep.equal(expected);
	});
});
