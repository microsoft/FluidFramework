/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	type LocalNodeKey,
	type NodeKeyManager,
	type StableNodeKey,
	compareLocalNodeKeys,
	createNodeKeyManager,
	MockNodeKeyManager,
} from "../../../feature-libraries/index.js";
import type { ISharedTree } from "../../../shared-tree/index.js";
import { TestTreeProvider } from "../../utils.js";

/**
 * Acquire an {@link IIdCompressor} via unsavory means.
 * @remarks TODO: Figure out a better way to get an IIDCompressor
 */
async function getIIDCompressor(tree?: ISharedTree): Promise<IIdCompressor> {
	const runtime = (
		(tree ?? (await TestTreeProvider.create(1)).trees[0]) as unknown as {
			runtime: IFluidDataStoreRuntime;
		}
	).runtime;
	return runtime.idCompressor ?? fail("Expected IIdCompressor to be present in runtime");
}

describe("Node Keys", () => {
	function itNodeKeyManager(title: string, fn: (manager: NodeKeyManager) => void): void {
		it(`${title} (mock)`, () => {
			fn(new MockNodeKeyManager());
		});
		it(`${title} (using IdCompressor)`, async () => {
			fn(createNodeKeyManager(await getIIDCompressor()));
		});
	}

	itNodeKeyManager("are unique", (manager) => {
		const localKeys = new Set<LocalNodeKey>();
		for (let i = 0; i < 50000; i++) {
			const id = manager.generateLocalNodeKey();
			assert(!localKeys.has(id));
			localKeys.add(id);
		}

		const stableKeys = new Set<StableNodeKey>();
		for (let i = 0; i < 50000; i++) {
			const id = manager.stabilizeNodeKey(manager.generateLocalNodeKey());
			assert(!stableKeys.has(id));
			stableKeys.add(id);
		}
	});

	itNodeKeyManager("can be compressed and decompressed", (manager) => {
		const id = manager.stabilizeNodeKey(manager.generateLocalNodeKey());
		const compressedId = manager.localizeNodeKey(id);
		const decompressedId = manager.stabilizeNodeKey(compressedId);
		assert.equal(id, decompressedId);
	});

	itNodeKeyManager("can be decompressed and compressed", (manager) => {
		const compressedId = manager.generateLocalNodeKey();
		const decompressedId = manager.stabilizeNodeKey(compressedId);
		const recompressedId = manager.localizeNodeKey(decompressedId);
		assert.equal(compareLocalNodeKeys(compressedId, recompressedId), 0);
	});

	itNodeKeyManager("are equatable when compressed", (manager) => {
		const idA = manager.generateLocalNodeKey();
		const idB = manager.generateLocalNodeKey();
		assert.equal(compareLocalNodeKeys(idA, idA), 0);
		assert.notEqual(compareLocalNodeKeys(idA, idB), 0);
	});

	itNodeKeyManager("are comparable when compressed", (manager) => {
		const idA = manager.generateLocalNodeKey();
		const idB = manager.generateLocalNodeKey();
		const idC = manager.generateLocalNodeKey();
		const sorts = [
			[idA, idB, idC].sort(compareLocalNodeKeys),
			[idA, idC, idB].sort(compareLocalNodeKeys),
			[idB, idA, idC].sort(compareLocalNodeKeys),
			[idB, idC, idA].sort(compareLocalNodeKeys),
			[idC, idA, idB].sort(compareLocalNodeKeys),
			[idC, idB, idA].sort(compareLocalNodeKeys),
		];
		for (let i = 1; i < sorts.length; i++) {
			assert.deepEqual(sorts[i - 1], sorts[i]);
		}
	});
});
