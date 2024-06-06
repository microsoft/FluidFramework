/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	GitRepo,
	type Package,
	type PackageNamePolicyConfig,
	getResolvedFluidRoot,
} from "@fluidframework/build-tools";
import { expect } from "chai";

import { Context } from "../../src/library/index.js";
import {
	type Feed,
	feeds,
	packagePublishesToFeed,
} from "../../src/library/repoPolicyCheck/npmPackages.js";

/**
 * Calculates the packages that should be published to a feed and returns a map of Feed to the packages that should be
 * published there.
 */
function FeedsForPackages(
	packages: Package[],
	config: PackageNamePolicyConfig,
): Map<Feed, Package[]> {
	const mapping = new Map<Feed, Package[]>();
	for (const pkg of packages) {
		for (const feed of feeds) {
			let pkgList = mapping.get(feed);
			if (pkgList === undefined) {
				pkgList = [];
			}

			if (!mapping.has(feed)) {
				mapping.set(feed, []);
			}

			if (packagePublishesToFeed(pkg.name, config, feed)) {
				mapping.get(feed)?.push(pkg);
			}
		}
	}
	return mapping;
}

describe("feeds", async () => {
	const resolvedRoot = await getResolvedFluidRoot();
	const gitRepo = new GitRepo(resolvedRoot);
	const branch = await gitRepo.getCurrentBranchName();

	const context = new Context(gitRepo, "microsoft/FluidFramework", branch);
	const config = context.rootFluidBuildConfig?.policy?.packageNames!;
	const packages = FeedsForPackages(context.packages, config);

	it("dev and build feed are mutually exclusive", () => {
		const dev = packages.get("internal-dev")?.map((p) => p.name);
		const build = packages.get("internal-build")?.map((p) => p.name);

		const hasDupes = build?.some((name) => {
			return dev?.includes(name);
		});

		expect(hasDupes).to.be.false;
	});
});
