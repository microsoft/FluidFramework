/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

interface BundleGroup {
	readonly label: string;
	readonly groups?: readonly BundleGroup[];
}

function modulePaths(group: BundleGroup, parent = ""): string[] {
	const path = `${parent}/${group.label}`.replaceAll("\\", "/");
	return group.groups === undefined || group.groups.length === 0
		? [path]
		: group.groups.flatMap((child) => modulePaths(child, path));
}

describe("Native hosting bundles", () => {
	it("keeps optional hosting out of stable DDS entrypoints", () => {
		// Run after the bundle-analysis webpack configuration, which uses emitted packages.
		const bundles = JSON.parse(
			readFileSync("./bundleAnalyzerJson/analyzer.json", "utf8"),
		) as BundleGroup[];
		for (const entrypoint of [
			"map",
			"directory",
			"matrix",
			"sharedString",
			"sharedTree",
			"fluidFramework",
		]) {
			const bundle = bundles.find((item) => item.label === `${entrypoint}.js`);
			assert(bundle !== undefined, `Missing ${entrypoint} bundle`);
			const modules = modulePaths(bundle);
			for (const module of [
				"/datastore/lib/leafChannelRuntime.js",
				"/datastore/lib/dataStoreRuntime.js",
				"/datastore/lib/localChannelContext.js",
				"/datastore/lib/remoteChannelContext.js",
				"/container-runtime/lib/nativeChannelCollection.js",
			]) {
				assert(
					modules.every((path) => !path.endsWith(module)),
					`${entrypoint} must not eagerly include ${module}`,
				);
			}
		}
		const nativeBundles = bundles.filter((bundle) =>
			modulePaths(bundle).some((path) =>
				path.endsWith("/datastore/lib/leafChannelRuntime.js"),
			),
		);
		assert.equal(
			nativeBundles.length,
			1,
			"Native leaf hosting should occur in one shared lazy chunk",
		);
		const nativeBundle = nativeBundles[0];
		assert(nativeBundle !== undefined);
		assert(
			modulePaths(nativeBundle).some((path) =>
				path.endsWith("/container-runtime/lib/nativeChannelCollection.js"),
			),
			"Leaf and composite hosting should share the native chunk",
		);
	});
});
