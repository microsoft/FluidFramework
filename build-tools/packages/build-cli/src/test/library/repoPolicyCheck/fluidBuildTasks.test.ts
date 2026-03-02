/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { describe, it } from "mocha";

import { shouldIgnoreBuildDependency } from "../../../library/repoPolicyCheck/fluidBuildTasks.js";

describe("shouldIgnoreBuildDependency", () => {
	// Two packages in groupA, one in groupB
	const packageMap = new Map([
		["pkg-a", { group: "groupA", version: "1.0.0" }],
		["pkg-b", { group: "groupA", version: "2.0.0" }],
		["pkg-c", { group: "groupB", version: "3.0.0" }],
	]);
	const curGroup = "groupA";

	it("does not ignore workspace: deps", () => {
		assert.isFalse(
			shouldIgnoreBuildDependency(
				{ name: "pkg-a", version: "workspace:~" },
				packageMap,
				curGroup,
			),
		);
	});

	it("ignores catalog: deps in the same group", () => {
		// catalog: is used for external/cross-workspace version pins; same-group packages
		// always use workspace:. Without this guard, semver.satisfies("2.0.0", "catalog:default")
		// would throw "Invalid comparator: catalog:default".
		assert.isTrue(
			shouldIgnoreBuildDependency(
				{ name: "pkg-b", version: "catalog:default" },
				packageMap,
				curGroup,
			),
		);
	});

	it("ignores catalog: (bare) deps in the same group", () => {
		assert.isTrue(
			shouldIgnoreBuildDependency(
				{ name: "pkg-a", version: "catalog:" },
				packageMap,
				curGroup,
			),
		);
	});

	it("ignores unknown packages", () => {
		assert.isTrue(
			shouldIgnoreBuildDependency(
				{ name: "external-pkg", version: "^1.0.0" },
				packageMap,
				curGroup,
			),
		);
	});

	it("ignores semver deps in a different group", () => {
		assert.isTrue(
			shouldIgnoreBuildDependency({ name: "pkg-c", version: "^3.0.0" }, packageMap, curGroup),
		);
	});

	it("ignores catalog: deps in a different group", () => {
		// Cross-group deps are excluded from build ordering even when referenced via catalog:.
		assert.isTrue(
			shouldIgnoreBuildDependency(
				{ name: "pkg-c", version: "catalog:default" },
				packageMap,
				curGroup,
			),
		);
	});

	it("does not ignore satisfied semver deps in the same group", () => {
		// pkg-a version "1.0.0" satisfies "^1.0.0" → !satisfied = false → include
		assert.isFalse(
			shouldIgnoreBuildDependency({ name: "pkg-a", version: "^1.0.0" }, packageMap, curGroup),
		);
	});

	it("ignores unsatisfied semver deps in the same group", () => {
		// pkg-a version "1.0.0" does not satisfy "^2.0.0" → !satisfied = true → ignore
		assert.isTrue(
			shouldIgnoreBuildDependency({ name: "pkg-a", version: "^2.0.0" }, packageMap, curGroup),
		);
	});
});
