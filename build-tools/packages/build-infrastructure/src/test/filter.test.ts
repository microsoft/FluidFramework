/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import chai, { assert, expect } from "chai";
import assertArrays from "chai-arrays";

import {
	AllPackagesSelectionCriteria,
	PackageFilterOptions,
	PackageSelectionCriteria,
	filterPackages,
	selectAndFilterPackages,
} from "../filter.js";
import { loadFluidRepo } from "../fluidRepo.js";
import { testDataPath } from "./init.js";
import type { ReleaseGroupName } from "../types.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

chai.use(assertArrays);

async function getFluidRepo() {
	const fluidRepo = loadFluidRepo(
		path.join(testDataPath, "./testRepo"),
		"microsoft/FluidFramework",
	);
	return fluidRepo;
}

async function getMainPackages() {
	const fluidRepo = await getFluidRepo();
	const packages = fluidRepo.releaseGroups
		.get("main" as ReleaseGroupName)
		?.packages.filter((p) => !p.isReleaseGroupRoot);
	assert(packages !== undefined);
	return packages;
}

describe("filterPackages", async () => {
	it("no filters", async () => {
		const packages = await getMainPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo(["pkg-a", "pkg-b", "@private/pkg-c", "@shared/shared"]);
	});

	it("private=true", async () => {
		const packages = await getMainPackages();
		const filters: PackageFilterOptions = {
			private: true,
			scope: undefined,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.containingAllOf(["@private/pkg-c"]);
		expect(names).to.be.ofSize(1);
	});

	it("private=false", async () => {
		const packages = await getMainPackages();
		const filters: PackageFilterOptions = {
			private: false,
			scope: undefined,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo(["pkg-a", "pkg-b", "@shared/shared"]);
	});

	it("multiple scopes", async () => {
		const packages = await getMainPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: ["@shared", "@private"],
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.containingAllOf(["@shared/shared", "@private/pkg-c"]);
	});

	it("multiple skipScopes", async () => {
		const packages = await getMainPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: ["@shared", "@private"],
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo(["pkg-a", "pkg-b"]);
	});

	it("scope and skipScope", async () => {
		const packages = await getMainPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: ["@shared", "@private"],
			skipScope: ["@shared"],
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo(["@private/pkg-c"]);
	});
});

describe("selectAndFilterPackages", async () => {
	it("all, no filters", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions = AllPackagesSelectionCriteria;
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const names = selected.map((p) => p.name);

		expect(names).to.be.containingAllOf([
			"pkg-a",
			"pkg-b",
			"@shared/shared",
			"@private/pkg-c",
		]);
	});

	it("select release group", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: ["main"],
			releaseGroupRoots: [],
			workspaces: [],
			workspaceRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const names = selected.map((p) => p.name);

		expect(names).to.be.equalTo(["pkg-a", "pkg-b", "@private/pkg-c", "@shared/shared"]);
	});

	it("select release group root", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: [],
			releaseGroupRoots: ["main"],
			workspaces: [],
			workspaceRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const dirs = selected.map((p) => fluidRepo.relativeToRepo(p.directory));

		expect(selected.length).to.equal(1);
		expect(dirs).to.be.containingAllOf([""]);
	});

	it("select directory", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: ["main"],
			releaseGroupRoots: [],
			workspaces: [],
			workspaceRoots: [],
			directory: "second/packages/other-pkg-a",
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected, filtered } = await selectAndFilterPackages(
			fluidRepo,
			selectionOptions,
			filters,
		);
		expect(selected).to.be.ofSize(1);
		expect(filtered).to.be.ofSize(1);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const pkg = filtered[0]!;

		expect(pkg.name).to.equal("other-pkg-a");
		expect(fluidRepo.relativeToRepo(pkg.directory)).to.equal("second/packages/other-pkg-a");
	});

	it("select release group, filter private", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: ["main"],
			releaseGroupRoots: [],
			workspaces: [],
			workspaceRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: true,
			scope: undefined,
			skipScope: undefined,
		};

		const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).to.be.containingAllOf(["@private/pkg-c"]);
	});

	it("select release group, filter non-private", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: ["main"],
			releaseGroupRoots: [],
			workspaces: [],
			workspaceRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: false,
			scope: undefined,
			skipScope: undefined,
		};

		const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).to.be.equalTo(["pkg-a", "pkg-b", "@shared/shared"]);
	});

	it("select release group, filter scopes", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: ["main"],
			releaseGroupRoots: [],
			workspaces: [],
			workspaceRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: ["@shared"],
			skipScope: undefined,
		};

		const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).to.be.equalTo(["@shared/shared"]);
	});

	it("select release group, filter skipScopes", async () => {
		const fluidRepo = await getFluidRepo();
		const selectionOptions: PackageSelectionCriteria = {
			releaseGroups: ["main"],
			releaseGroupRoots: [],
			workspaces: [],
			workspaceRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: ["@shared", "@private"],
		};

		const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).to.be.equalTo(["pkg-a", "pkg-b"]);
	});
});
