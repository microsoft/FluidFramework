/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Build } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import { BuildResult, BuildStatus } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import { assert } from "chai";
import { describe, it } from "mocha";

import { findBuild } from "../../../library/azureDevops/getArtifactForCommit.js";

const headSha = "pr-head";
const match = { kind: "prHead", sha: headSha } as const;

function makeBuild(overrides: Partial<Build> = {}): Build {
	const build: Build & { triggerInfo: Record<string, string> } = {
		id: 1,
		status: BuildStatus.Completed,
		result: BuildResult.Succeeded,
		sourceVersion: "merge-commit",
		triggerInfo: { "pr.sourceSha": headSha },
		...overrides,
	};
	return build;
}

describe("azureDevops/getArtifactForCommit", () => {
	it("accepts a partially successful build", () => {
		const result = findBuild(
			[makeBuild({ id: 2, result: BuildResult.PartiallySucceeded })],
			match,
		);

		assert.deepEqual(result, {
			kind: "completed",
			buildId: 2,
			sourceVersion: "merge-commit",
		});
	});

	it("prefers a fully successful build over a newer partially successful build", () => {
		const result = findBuild(
			[
				makeBuild({
					id: 2,
					result: BuildResult.PartiallySucceeded,
					sourceVersion: "newer-partial",
				}),
				makeBuild({ id: 1, sourceVersion: "older-success" }),
			],
			match,
		);

		assert.deepEqual(result, {
			kind: "completed",
			buildId: 1,
			sourceVersion: "older-success",
		});
	});

	it("reports all failed when no build succeeded or partially succeeded", () => {
		const result = findBuild(
			[makeBuild({ result: BuildResult.Failed }), makeBuild({ result: BuildResult.Canceled })],
			match,
		);

		assert.deepEqual(result, { kind: "all-failed" });
	});

	it("reports a missing id for a partially successful build", () => {
		const result = findBuild(
			[makeBuild({ id: undefined, result: BuildResult.PartiallySucceeded })],
			match,
		);

		assert.deepEqual(result, { kind: "no-id" });
	});
});
