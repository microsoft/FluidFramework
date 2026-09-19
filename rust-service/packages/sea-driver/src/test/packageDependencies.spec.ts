/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("Package dependencies", () => {
	/** Workspace dependency fields relevant to the driver isolation contract. */
	interface WorkspacePackage {
		/** Package identity used to detect forbidden dependencies. */
		readonly name: string;
		/** Runtime dependencies, including workspace links. */
		readonly dependencies?: Readonly<Record<string, string>>;
		/** Development dependencies, which also participate in the build graph. */
		readonly devDependencies?: Readonly<Record<string, string>>;
		/** Optional dependencies, which must also respect the package boundary. */
		readonly optionalDependencies?: Readonly<Record<string, string>>;
		/** Peer dependencies that a consumer must provide. */
		readonly peerDependencies?: Readonly<Record<string, string>>;
	}

	it("sea-driver's workspace dependency graph does not reach SharedTree", () => {
		const visited = new Set<string>();
		const pending = [fileURLToPath(new URL("../../package.json", import.meta.url))];
		while (pending.length > 0) {
			const next = pending.pop();
			assert.ok(next !== undefined);
			const manifestPath = realpathSync(next);
			if (visited.has(manifestPath)) {
				continue;
			}
			visited.add(manifestPath);
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as WorkspacePackage;
			assert.notEqual(manifest.name, "@fluidframework/tree");
			assert.notEqual(manifest.name, "@fluidframework/sea-tree");
			for (const dependencies of [
				manifest.dependencies,
				manifest.devDependencies,
				manifest.optionalDependencies,
				manifest.peerDependencies,
			]) {
				for (const [name, version] of Object.entries(dependencies ?? {})) {
					assert.notEqual(
						name,
						"@fluidframework/tree",
						`${manifest.name} depends on SharedTree`,
					);
					assert.notEqual(
						name,
						"@fluidframework/sea-tree",
						`${manifest.name} depends on sea-tree`,
					);
					if (version.startsWith("workspace:")) {
						pending.push(resolve(dirname(manifestPath), "node_modules", name, "package.json"));
					}
				}
			}
		}
		assert.ok(visited.size > 1, "the check must traverse workspace dependencies");
	});
});
