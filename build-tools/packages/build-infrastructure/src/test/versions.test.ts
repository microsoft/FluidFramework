/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";

import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import * as semver from "semver";

import { loadFluidRepo } from "../fluidRepo.js";
import type { ReleaseGroupName, WorkspaceName } from "../types.js";
import { setDependencyVersion, setVersion } from "../versions.js";

import { testDataPath } from "./init.js";

const repo = loadFluidRepo(path.join(testDataPath, "./testRepo"));
const main = repo.releaseGroups.get("main" as ReleaseGroupName);
assert(main !== undefined);

const group2 = repo.releaseGroups.get("group2" as ReleaseGroupName);
assert(group2 !== undefined);

const secondWorkspace = repo.workspaces.get("second" as WorkspaceName);
assert(secondWorkspace !== undefined);

describe("setVersion", () => {
	afterEach(async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion([...repo.packages.values()], semver.parse("1.0.0")!);
		// await setVersion(
		// 	repo,
		// 	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// 	repo.releaseGroups.get("group2" as ReleaseGroupName)!.packages,
		// 	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// 	semver.parse("2.0.0")!,
		// );
		await setVersion(
			secondWorkspace.packages,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			semver.parse("2.0.0")!,
		);
		repo.reload();
	});

	it("release group", async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(main.packages, semver.parse("1.2.1")!);
		repo.reload();

		const allCorrect = main.packages.every((pkg) => pkg.version === "1.2.1");
		expect(main.version).to.equal("1.2.1");
		expect(allCorrect).to.be.true;
	});

	it("workspace", async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(secondWorkspace.packages, semver.parse("2.2.1")!);
		repo.reload();

		const allCorrect = secondWorkspace.packages.every((pkg) => pkg.version === "2.2.1");
		expect(allCorrect).to.be.true;
	});

	it("repo", async () => {
		const packages = [...repo.packages.values()];
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(packages, semver.parse("1.2.1")!);
		repo.reload();

		const allCorrect = packages.every((pkg) => pkg.version === "1.2.1");
		expect(allCorrect).to.be.true;
	});
});

describe("setDependencyVersion", () => {
	// afterEach(async () => {
	// 	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// 	await setVersion([...repo.packages.values()], semver.parse("1.0.0")!);
	// 	await setVersion(
	// 		secondWorkspace.packages,
	// 		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// 		semver.parse("2.0.0")!,
	// 	);
	// });

	it("update release group deps", async () => {
		await setDependencyVersion(
			main.packages,
			group2.packages.map((p) => p.name),
			"workspace:~",
		);
		repo.reload();

		const depsToCheck = new Set(group2.packages.map((p) => p.name));
		const allCorrect = main.packages.every((pkg) => {
			for (const { name, version } of pkg.combinedDependencies) {
				if (!depsToCheck.has(name)) {
					continue;
				}
				const matches = version === "workspace:~";
				if (matches === false) {
					return false;
				}
			}
			return true;
		});
		expect(allCorrect).to.be.true;
	});
});
