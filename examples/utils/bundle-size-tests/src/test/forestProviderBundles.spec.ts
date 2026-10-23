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

function assertUsesEmittedTreeArtifacts(modules: readonly string[]): void {
	assert(
		modules.some((module) => module.includes("/packages/dds/tree/lib/")),
		"Expected bundle to include the emitted @fluidframework/tree package",
	);
	assert(
		modules.every((module) => !module.includes("/packages/dds/tree/src/")),
		"Expected bundle to exclude @fluidframework/tree source files",
	);
}

describe("SharedTree forest provider bundles", () => {
	it("isolates forest providers", () => {
		// This test must be run after webpack.
		const stats = JSON.parse(
			readFileSync("./build/forest-provider-probes/stats.json", "utf-8"),
		) as WebpackStats;
		const referenceProvider = "/packages/dds/tree/lib/shared-tree/forestTypeReference.js";
		const optimizedProvider = "/packages/dds/tree/lib/shared-tree/forestTypeOptimized.js";
		const debugProvider = "/packages/dds/tree/lib/shared-tree/forestTypeExpensiveDebug.js";
		const objectForest =
			"/packages/dds/tree/lib/feature-libraries/object-forest/objectForest.js";
		const chunkedForest =
			"/packages/dds/tree/lib/feature-libraries/chunked-forest/chunkedForest.js";
		const comparisonForest =
			"/packages/dds/tree/lib/feature-libraries/comparison-forest/comparisonForest.js";

		const defaultModules = getEntrypointModules(stats, "sharedTreeDefault");
		assertUsesEmittedTreeArtifacts(defaultModules);
		assertIncludesModule(defaultModules, referenceProvider);
		assertExcludesModule(defaultModules, optimizedProvider);
		assertExcludesModule(defaultModules, debugProvider);
		assertIncludesModule(defaultModules, objectForest);
		assertExcludesModule(defaultModules, chunkedForest);
		assertExcludesModule(defaultModules, comparisonForest);

		const referenceModules = getEntrypointModules(stats, "sharedTreeReferenceForest");
		assertUsesEmittedTreeArtifacts(referenceModules);
		assertIncludesModule(referenceModules, referenceProvider);
		assertExcludesModule(referenceModules, optimizedProvider);
		assertExcludesModule(referenceModules, debugProvider);
		assertIncludesModule(referenceModules, objectForest);
		assertExcludesModule(referenceModules, chunkedForest);
		assertExcludesModule(referenceModules, comparisonForest);

		const optimizedModules = getEntrypointModules(stats, "sharedTreeOptimizedForest");
		assertUsesEmittedTreeArtifacts(optimizedModules);
		assertIncludesModule(optimizedModules, referenceProvider);
		assertIncludesModule(optimizedModules, optimizedProvider);
		assertExcludesModule(optimizedModules, debugProvider);
		// ObjectForest remains reachable because existing APIs use it as the default when no
		// forest is provided. Removing that default requires a separate API change.
		assertIncludesModule(optimizedModules, objectForest);
		assertIncludesModule(optimizedModules, chunkedForest);
		assertExcludesModule(optimizedModules, comparisonForest);

		const debugModules = getEntrypointModules(stats, "sharedTreeExpensiveDebugForest");
		assertUsesEmittedTreeArtifacts(debugModules);
		assertIncludesModule(debugModules, referenceProvider);
		assertExcludesModule(debugModules, optimizedProvider);
		assertIncludesModule(debugModules, debugProvider);
		assertIncludesModule(debugModules, objectForest);
		assertIncludesModule(debugModules, chunkedForest);
		assertIncludesModule(debugModules, comparisonForest);
	});
});
