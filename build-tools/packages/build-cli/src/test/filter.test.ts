/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Package, getResolvedFluidRoot } from "@fluidframework/build-tools";
import { PackageName } from "@rushstack/node-core-library";
import { describe, expect, it } from "vitest";

import {
	AllPackagesSelectionCriteria,
	PackageFilterOptions,
	PackageSelectionCriteria,
	filterPackages,
	selectAndFilterPackages,
} from "../filter.js";
import { Context } from "../library/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getContext() {
	const resolvedRoot = await getResolvedFluidRoot();
	const context = new Context(resolvedRoot);
	return context;
}

async function getBuildToolsPackages(): Promise<Package[]> {
	const context = await getContext();
	// Use the build-tools packages as test cases. It's brittle, but functional. Ideally, we would have mocks for
	// context/package/release group/etc., but we don't.
	const packages = context.packagesInReleaseGroup("build-tools");
	return packages;
}

async function getClientPackages(): Promise<Package[]> {
	const context = await getContext();
	const packages = context.packagesInReleaseGroup("client");
	return packages;
}

describe("filterPackages", () => {
	it("no filters", async () => {
		const packages = await getBuildToolsPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		[
			"@fluid-tools/build-cli",
			"@fluid-tools/build-infrastructure",
			"@fluidframework/build-tools",
			"@fluidframework/bundle-size-tools",
			"@fluid-tools/version-tools",
		].forEach((item) => {
			expect(names).toContain(item);
		});
	});

	it("private=true", async () => {
		const packages = await getClientPackages();
		const filters: PackageFilterOptions = {
			private: true,
			scope: undefined,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		["@fluid-private/changelog-generator-wrapper"].forEach((item) => {
			expect(names).toContain(item);
		});
	});

	it("private=false", async () => {
		const packages = await getBuildToolsPackages();
		const filters: PackageFilterOptions = {
			private: false,
			scope: undefined,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).toHaveLength(4);
		[
			"@fluid-tools/build-cli",
			"@fluidframework/build-tools",
			"@fluidframework/bundle-size-tools",
			"@fluid-tools/version-tools",
		].forEach((item) => {
			expect(names).toContain(item);
		});
	});

	it("multiple scopes", async () => {
		const scopes = ["@fluidframework", "@fluid-private"];
		const packages = await getClientPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: scopes,
			skipScope: undefined,
		};
		const actual = await filterPackages(packages, filters);
		actual.forEach((pkg) => {
			// Check that no packages have an unexpected scope
			expect(scopes).toContain(PackageName.getScope(pkg.name));
		});
	});

	it("multiple skipScopes", async () => {
		const packages = await getBuildToolsPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: ["@fluidframework", "@fluid-private"],
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).toEqual(
			expect.arrayContaining(["@fluid-tools/build-cli", "@fluid-tools/version-tools"]),
		);
		expect(names).toHaveLength(2);
	});

	it("scope and skipScope", async () => {
		const packages = await getBuildToolsPackages();
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: ["@fluidframework", "@fluid-internal"],
			skipScope: ["@fluid-internal"],
		};
		const actual = await filterPackages(packages, filters);
		const names = actual.map((p) => p.name);
		expect(names).toEqual(
			expect.arrayContaining([
				"@fluidframework/build-tools",
				"@fluidframework/bundle-size-tools",
			]),
		);
	});
});

describe("selectAndFilterPackages", () => {
	it("all, no filters", async () => {
		const context = await getContext();
		const selectionOptions = AllPackagesSelectionCriteria;
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = selected.map((p) => p.name);
		[
			"@fluid-tools/build-cli",
			"@fluid-tools/build-infrastructure",
			"@fluidframework/build-tools",
			"@fluidframework/bundle-size-tools",
			"@fluid-tools/version-tools",
		].forEach((item) => {
			expect(names).toContain(item);
		});
	});

	it("select independent packages", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: true,
			releaseGroups: [],
			releaseGroupRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = selected.map((p) => p.name);
		expect(names).toEqual(
			expect.arrayContaining([
				"@fluidframework/build-common",
				"@fluidframework/eslint-config-fluid",
				"@fluid-internal/eslint-plugin-fluid",
				"@fluidframework/protocol-definitions",
				"@fluid-tools/api-markdown-documenter",
				"@fluid-tools/benchmark",
				"@fluid-internal/getkeys",
				"@fluidframework/test-tools",
			]),
		);
	});

	it("select release group", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: ["build-tools"],
			releaseGroupRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = selected.map((p) => p.name);

		[
			"@fluid-tools/build-cli",
			"@fluid-tools/build-infrastructure",
			"@fluidframework/build-tools",
			"@fluidframework/bundle-size-tools",
			"@fluid-tools/version-tools",
		].forEach((item) => {
			expect(names).toContain(item);
		});
		expect(names).toHaveLength(4);
	});

	it("select release group root", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: [],
			releaseGroupRoots: ["build-tools"],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected } = await selectAndFilterPackages(context, selectionOptions, filters);
		const dirs = selected.map((p) => context.repo.relativeToRepo(p.directory));

		expect(selected).toHaveLength(1);
		expect(dirs).toContain("build-tools");
	});

	it("select directory", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: [],
			releaseGroupRoots: [],
			directory: path.resolve(__dirname, "../.."),
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: undefined,
		};

		const { selected, filtered } = await selectAndFilterPackages(
			context,
			selectionOptions,
			filters,
		);
		expect(selected).toHaveLength(1);
		expect(filtered).toHaveLength(1);

		const pkg = filtered[0];

		expect(pkg?.name).to.equal("@fluid-tools/build-cli");
		expect(context.repo.relativeToRepo(pkg?.directory ?? "")).to.equal(
			"build-tools/packages/build-cli",
		);
	});

	it("select release group, filter private", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: ["client"],
			releaseGroupRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: true,
			scope: undefined,
			skipScope: undefined,
		};

		const { filtered } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).toContain("@fluid-private/changelog-generator-wrapper");
	});

	it("select release group, filter non-private", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: ["build-tools"],
			releaseGroupRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: false,
			scope: undefined,
			skipScope: undefined,
		};

		const { filtered } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).toEqual(
			expect.arrayContaining([
				"@fluid-tools/build-cli",
				"@fluidframework/build-tools",
				"@fluidframework/bundle-size-tools",
				"@fluid-tools/version-tools",
			]),
		);
	});

	it("select release group, filter scopes", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: ["build-tools"],
			releaseGroupRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: ["@fluid-tools"],
			skipScope: undefined,
		};

		const { filtered } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).toEqual(
			expect.arrayContaining(["@fluid-tools/build-cli", "@fluid-tools/version-tools"]),
		);
	});

	it("select release group, filter skipScopes", async () => {
		const context = await getContext();
		const selectionOptions: PackageSelectionCriteria = {
			independentPackages: false,
			releaseGroups: ["build-tools"],
			releaseGroupRoots: [],
			directory: undefined,
			changedSinceBranch: undefined,
		};
		const filters: PackageFilterOptions = {
			private: undefined,
			scope: undefined,
			skipScope: ["@fluid-tools", "@fluid-private"],
		};

		const { filtered } = await selectAndFilterPackages(context, selectionOptions, filters);
		const names = filtered.map((p) => p.name);

		expect(names).toEqual(
			expect.arrayContaining([
				"@fluidframework/build-tools",
				"@fluidframework/bundle-size-tools",
			]),
		);
	});
});
