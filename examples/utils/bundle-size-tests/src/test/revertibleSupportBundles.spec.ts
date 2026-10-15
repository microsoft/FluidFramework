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
		Record<
			string,
			{
				readonly chunks?: readonly (number | string)[];
				readonly assets?: readonly string[];
			}
		>
	>;
	readonly assets: Readonly<Record<string, number>>;
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

function getEntrypointSize(stats: WebpackStats, entrypoint: string): number {
	const assets = stats.entrypoints[entrypoint]?.assets;
	assert(
		assets !== undefined && assets.length > 0,
		`Missing webpack assets for ${entrypoint}`,
	);
	return assets.reduce((size, asset) => size + (stats.assets[asset] ?? 0), 0);
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

describe("SharedTree revertible support bundles", () => {
	it("excludes enabled history recovery from the disabled bundle", () => {
		const stats = JSON.parse(
			readFileSync("./build/forest-provider-probes/stats.json", "utf-8"),
		) as WebpackStats;
		const treeCheckout = "/packages/dds/tree/lib/shared-tree/treeCheckout.js";
		const enabledSupport = "/packages/dds/tree/lib/shared-tree/revertibleSupportEnabled.js";
		const disabledSupport = "/packages/dds/tree/lib/shared-tree/revertibleSupportDisabled.js";

		const disabledSharedTreeModules = getEntrypointModules(
			stats,
			"sharedTreeRevertibleSupportDisabled",
		);
		assertIncludesModule(disabledSharedTreeModules, treeCheckout);
		assertIncludesModule(disabledSharedTreeModules, disabledSupport);
		assertExcludesModule(disabledSharedTreeModules, enabledSupport);

		const enabledSharedTreeModules = getEntrypointModules(
			stats,
			"sharedTreeRevertibleSupportEnabled",
		);
		assertIncludesModule(enabledSharedTreeModules, enabledSupport);

		const disabledSharedTreeSize = getEntrypointSize(
			stats,
			"sharedTreeRevertibleSupportDisabled",
		);
		const enabledSharedTreeSize = getEntrypointSize(
			stats,
			"sharedTreeRevertibleSupportEnabled",
		);
		assert(
			enabledSharedTreeSize - disabledSharedTreeSize >= 1000,
			`Expected the no-history SharedTree factory to save at least 1 kB, but measured ${enabledSharedTreeSize - disabledSharedTreeSize} bytes`,
		);
	});
});
