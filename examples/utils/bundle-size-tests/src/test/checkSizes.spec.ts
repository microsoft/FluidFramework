/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

interface WebpackModule {
	readonly name?: string;
	readonly chunks?: readonly (number | string)[];
	readonly modules?: readonly WebpackModule[];
}

interface WebpackStats {
	readonly entrypoints: Readonly<
		Record<string, { readonly chunks?: readonly (number | string)[] }>
	>;
	readonly modules: readonly WebpackModule[];
}

function getEntrypointModules(stats: WebpackStats, entrypoint: string): readonly string[] {
	const entrypointChunks = new Set(stats.entrypoints[entrypoint]?.chunks);
	assert(entrypointChunks.size > 0, `Missing webpack chunks for ${entrypoint}`);

	const modules: string[] = [];
	const visit = (
		module: WebpackModule,
		inheritedChunks: readonly (number | string)[] = [],
	): void => {
		const chunks =
			module.chunks !== undefined && module.chunks.length > 0
				? module.chunks
				: inheritedChunks;
		if (module.name !== undefined && chunks.some((chunk) => entrypointChunks.has(chunk))) {
			modules.push(module.name.replaceAll("\\", "/"));
		}
		for (const child of module.modules ?? []) {
			visit(child, chunks);
		}
	};

	for (const module of stats.modules) {
		visit(module);
	}
	return modules;
}

function assertIncludesModule(modules: readonly string[], modulePath: string): void {
	assert(
		modules.some((module) => module.endsWith(modulePath)),
		`Expected bundle to include ${modulePath}`,
	);
}

function assertExcludesModule(modules: readonly string[], modulePath: string): void {
	assert(
		modules.every((module) => !module.endsWith(modulePath)),
		`Expected bundle to exclude ${modulePath}`,
	);
}

// Since bundle size analysis doesn't block regressions, do a sanity check here.
// This bundle should remain its current tiny size for the foreseeable future so putting a hard limit on its size should be ok.
// Additionally, this specific bundling scenario is regressed in the past, so protecting it with a regression test is known to have some value.
describe("checkSizes", () => {
	it("sharedTreeAttributes", () => {
		// This test must be run after webpack.
		const bundle = readFileSync("./build/sharedTreeAttributes.js", "utf-8");

		// Make sure it contains something
		assert(bundle.length > 10);
		// Make sure does not contain a lot more than just the attributes.
		assert(bundle.length < 1000);
	});

	it("isolates SharedTree forest providers", () => {
		// This test must be run after webpack.
		const stats = JSON.parse(
			readFileSync("./build/forest-provider-probes/stats.json", "utf-8"),
		) as WebpackStats;
		const chunkedForest =
			"/packages/dds/tree/lib/feature-libraries/chunked-forest/chunkedForest.js";
		const comparisonForest =
			"/packages/dds/tree/lib/feature-libraries/comparison-forest/comparisonForest.js";

		const referenceModules = getEntrypointModules(stats, "sharedTreeReferenceForest");
		assertIncludesModule(
			referenceModules,
			"/packages/dds/tree/lib/shared-tree/forestTypeReference.js",
		);
		assertExcludesModule(referenceModules, chunkedForest);
		assertExcludesModule(referenceModules, comparisonForest);

		const optimizedModules = getEntrypointModules(stats, "sharedTreeOptimizedForest");
		assertIncludesModule(optimizedModules, chunkedForest);
		assertExcludesModule(optimizedModules, comparisonForest);

		const debugModules = getEntrypointModules(stats, "sharedTreeExpensiveDebugForest");
		assertIncludesModule(debugModules, chunkedForest);
		assertIncludesModule(debugModules, comparisonForest);
	});
});
