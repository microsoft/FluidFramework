/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chai, { assert, expect } from "chai";
import assertArrays from "chai-arrays";

import { loadBuildProject } from "../buildProject.js";
import {
	AllPackagesSelectionCriteria,
	EmptySelectionCriteria,
	PackageFilterOptions,
	PackageSelectionCriteria,
	filterPackages,
	selectAndFilterPackages,
} from "../filter.js";
import type { IBuildProject, IPackage, WorkspaceName } from "../types.js";

import { testRepoRoot } from "./init.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

chai.use(assertArrays);

const EmptyFilter: PackageFilterOptions = {
	private: undefined,
	scope: undefined,
	skipScope: undefined,
};

async function getBuildProject(): Promise<IBuildProject> {
	const fluidRepo = loadBuildProject(testRepoRoot, "microsoft/FluidFramework");
	return fluidRepo;
}

async function getMainWorkspacePackages(): Promise<IPackage[]> {
	const fluidRepo = await getBuildProject();
	const packages = fluidRepo.workspaces.get("main" as WorkspaceName)?.packages;
	assert(packages !== undefined);
	return packages;
}

describe("filterPackages", () => {
	it("no filters", async () => {
		const packages = await getMainWorkspacePackages();
		const filters = EmptyFilter;

		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo([
			"main-release-group-root",
			"@group2/pkg-d",
			"@group2/pkg-e",
			"@group3/pkg-f",
			"@group3/pkg-g",
			"pkg-a",
			"pkg-b",
			"@private/pkg-c",
			"@shared/shared",
		]);
	});

	it("private=true", async () => {
		const packages = await getMainWorkspacePackages();
		const filters = { ...EmptyFilter, private: true };
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.containingAllOf(["@private/pkg-c"]);
		expect(names).to.be.ofSize(1);
	});

	it("private=false", async () => {
		const packages = await getMainWorkspacePackages();
		const filters = { ...EmptyFilter, private: false };
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo([
			"main-release-group-root",
			"@group2/pkg-d",
			"@group2/pkg-e",
			"@group3/pkg-f",
			"@group3/pkg-g",
			"pkg-a",
			"pkg-b",
			"@shared/shared",
		]);
	});

	it("multiple scopes", async () => {
		const packages = await getMainWorkspacePackages();
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
		const packages = await getMainWorkspacePackages();
		const filters: PackageFilterOptions = {
			...EmptyFilter,
			skipScope: ["@shared", "@private", "@group3"],
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo([
			"main-release-group-root",
			"@group2/pkg-d",
			"@group2/pkg-e",
			"pkg-a",
			"pkg-b",
		]);
	});

	it("scope and skipScope", async () => {
		const packages = await getMainWorkspacePackages();
		const filters: PackageFilterOptions = {
			...EmptyFilter,
			scope: ["@shared", "@private"],
			skipScope: ["@shared"],
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).to.be.equalTo(["@private/pkg-c"]);
	});
});

describe("selectAndFilterPackages", () => {
	const fluidRepoPromise = getBuildProject();

	it("all, no filters", async () => {
		const fluidRepo = await fluidRepoPromise;
		const selectionOptions = AllPackagesSelectionCriteria;
		const filter = EmptyFilter;

		const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filter);
		const names = selected.map((p) => p.name).sort();

		expect(names).to.be.equalTo([
			"@group2/pkg-d",
			"@group2/pkg-e",
			"@group3/pkg-f",
			"@group3/pkg-g",
			"@private/pkg-c",
			"@shared/shared",
			"main-release-group-root",
			"other-pkg-a",
			"other-pkg-b",
			"pkg-a",
			"pkg-b",
			"second-release-group-root",
		]);
	});

	it("select directory", async () => {
		const fluidRepo = await fluidRepoPromise;
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

	describe("select release group", () => {
		it("no filters", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				releaseGroups: ["main"],
			};
			const filters: PackageFilterOptions = EmptyFilter;

			const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = selected.map((p) => p.name);

			expect(names).to.be.equalTo(["pkg-a", "pkg-b", "@private/pkg-c", "@shared/shared"]);
		});

		it("select release group root", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				releaseGroupRoots: ["main"],
			};
			const filters: PackageFilterOptions = EmptyFilter;

			const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const dirs = selected.map((p) => fluidRepo.relativeToRepo(p.directory));

			expect(selected.length).to.equal(1);
			expect(dirs).to.be.containingAllOf([""]);
		});

		it("filter private", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				releaseGroups: ["main"],
			};
			const filters: PackageFilterOptions = {
				...EmptyFilter,
				private: true,
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.containingAllOf(["@private/pkg-c"]);
		});

		it("filter non-private", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				releaseGroups: ["main"],
			};
			const filters: PackageFilterOptions = {
				...EmptyFilter,
				private: false,
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.equalTo(["pkg-a", "pkg-b", "@shared/shared"]);
		});

		it("filter scopes", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				releaseGroups: ["main"],
			};
			const filters: PackageFilterOptions = {
				...EmptyFilter,
				scope: ["@shared"],
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.equalTo(["@shared/shared"]);
		});

		it("filter skipScopes", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				releaseGroups: ["main"],
			};
			const filters: PackageFilterOptions = {
				...EmptyFilter,
				skipScope: ["@shared", "@private"],
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.equalTo(["pkg-a", "pkg-b"]);
		});
	});

	describe("select workspace", () => {
		it("all, no filters", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaces: ["main"],
			};
			const filters: PackageFilterOptions = EmptyFilter;

			const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = selected.map((p) => p.name);

			expect(names).to.be.equalTo([
				"@group2/pkg-d",
				"@group2/pkg-e",
				"@group3/pkg-f",
				"@group3/pkg-g",
				"pkg-a",
				"pkg-b",
				"@private/pkg-c",
				"@shared/shared",
			]);
		});

		it("select workspace root at repo root", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaceRoots: ["main"],
			};
			const filters: PackageFilterOptions = EmptyFilter;

			const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const dirs = selected.map((p) => fluidRepo.relativeToRepo(p.directory));

			expect(selected.length).to.equal(1);
			expect(dirs).to.be.containingAllOf([""]);
		});

		it("select workspace root not at repo root", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaceRoots: ["second"],
			};
			const filters: PackageFilterOptions = EmptyFilter;

			const { selected } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const dirs = selected.map((p) => fluidRepo.relativeToRepo(p.directory));

			expect(selected.length).to.equal(1);
			expect(dirs).to.be.containingAllOf(["second"]);
		});

		it("filter private", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaces: ["main"],
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

		it("filter non-private", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaces: ["main"],
			};
			const filters: PackageFilterOptions = {
				private: false,
				scope: undefined,
				skipScope: undefined,
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.equalTo([
				"@group2/pkg-d",
				"@group2/pkg-e",
				"@group3/pkg-f",
				"@group3/pkg-g",
				"pkg-a",
				"pkg-b",
				"@shared/shared",
			]);
		});

		it("filter scopes", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaces: ["main"],
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

		it("filter skipScopes", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaces: ["main"],
			};
			const filters: PackageFilterOptions = {
				private: undefined,
				scope: undefined,
				skipScope: ["@shared", "@private", "@group3"],
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.equalTo(["@group2/pkg-d", "@group2/pkg-e", "pkg-a", "pkg-b"]);
		});
	});

	describe("combination workspace and release group", () => {
		const filters: PackageFilterOptions = EmptyFilter;

		it("selects workspace and disjoint release group", async () => {
			const fluidRepo = await fluidRepoPromise;
			const selectionOptions: PackageSelectionCriteria = {
				...EmptySelectionCriteria,
				workspaces: ["second"],
				releaseGroups: ["group2"],
			};

			const { filtered } = await selectAndFilterPackages(fluidRepo, selectionOptions, filters);
			const names = filtered.map((p) => p.name);

			expect(names).to.be.equalTo([
				"other-pkg-a",
				"other-pkg-b",
				"@group2/pkg-d",
				"@group2/pkg-e",
			]);
		});
	});

	it("selects all release groups", async () => {
		const fluidRepo = await fluidRepoPromise;
		const selectionOptions: PackageSelectionCriteria = {
			...EmptySelectionCriteria,
			releaseGroups: ["*"],
		};

		const { filtered } = await selectAndFilterPackages(
			fluidRepo,
			selectionOptions,
			EmptyFilter,
		);
		const names = filtered.map((p) => p.name).sort();

		expect(names).to.be.equalTo(
			[
				"@group2/pkg-d",
				"@group2/pkg-e",
				"@group3/pkg-f",
				"@group3/pkg-g",
				"@private/pkg-c",
				"@shared/shared",
				"other-pkg-a",
				"other-pkg-b",
				"pkg-a",
				"pkg-b",
			].sort(),
		);
	});
});
