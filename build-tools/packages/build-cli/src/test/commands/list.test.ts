/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Package, getResolvedFluidRoot } from "@fluidframework/build-tools";
import { expect } from "chai";
import { describe, it } from "mocha";

import { type PackageNamePolicyConfig } from "../../config.js";
import { Context } from "../../library/index.js";
import {
	type Feed,
	feeds,
	packagePublishesToFeed,
} from "../../library/repoPolicyCheck/npmPackages.js";

/**
 * Calculates the packages that should be published to a feed and returns a map of Feed to the packages that should be
 * published there.
 */
function feedsForPackages(
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

describe("feeds", () => {
	it("dev and build feed are mutually exclusive", async () => {
		const resolvedRoot = await getResolvedFluidRoot();

		const context = new Context(resolvedRoot);
		const config = context.flubConfig.policy?.packageNames;
		if (config === undefined || config === null) {
			throw new Error(`config is undefined or null`);
		}
		const packages = feedsForPackages(context.packages, config);

		const dev = packages.get("internal-dev")?.map((p) => p.name);
		const build = packages.get("internal-build")?.map((p) => p.name);

		const hasDupes = build?.some((name) => {
			return dev?.includes(name);
		});

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(hasDupes).to.be.false;
	});
});
