/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	type LocalNodeIdentifier,
	type NodeIdentifierManager,
	type StableNodeIdentifier,
	compareLocalNodeIdentifiers,
	createNodeIdentifierManager,
	MockNodeIdentifierManager,
} from "../../../feature-libraries/index.js";
import type { ITreePrivate } from "../../../shared-tree/index.js";
import { TestTreeProvider } from "../../utils.js";

/**
 * Acquire an {@link IIdCompressor} via unsavory means.
 * @remarks TODO: Figure out a better way to get an IIDCompressor
 */
async function getIIDCompressor(tree?: ITreePrivate): Promise<IIdCompressor> {
	const runtime = (
		(tree ?? (await TestTreeProvider.create(1)).trees[0]) as unknown as {
			runtime: IFluidDataStoreRuntime;
		}
	).runtime;
	return runtime.idCompressor ?? fail("Expected IIdCompressor to be present in runtime");
}

describe("Node Identifier", () => {
	function itNodeKeyManager(
		title: string,
		fn: (manager: NodeIdentifierManager) => void,
	): void {
		it(`${title} (mock)`, () => {
			fn(new MockNodeIdentifierManager());
		});
		it(`${title} (using IdCompressor)`, async () => {
			fn(createNodeIdentifierManager(await getIIDCompressor()));
		});
	}

	itNodeKeyManager("are unique", (manager) => {
		const localKeys = new Set<LocalNodeIdentifier>();
		for (let i = 0; i < 50000; i++) {
			const id = manager.generateLocalNodeIdentifier();
			assert(!localKeys.has(id));
			localKeys.add(id);
		}

		const stableKeys = new Set<StableNodeIdentifier>();
		for (let i = 0; i < 50000; i++) {
			const id = manager.stabilizeNodeIdentifier(manager.generateLocalNodeIdentifier());
			assert(!stableKeys.has(id));
			stableKeys.add(id);
		}
	});

	itNodeKeyManager("can be compressed and decompressed", (manager) => {
		const id = manager.stabilizeNodeIdentifier(manager.generateLocalNodeIdentifier());
		const compressedId = manager.localizeNodeIdentifier(id);
		const decompressedId = manager.stabilizeNodeIdentifier(compressedId);
		assert.equal(id, decompressedId);
	});

	itNodeKeyManager("can be decompressed and compressed", (manager) => {
		const compressedId = manager.generateLocalNodeIdentifier();
		const decompressedId = manager.stabilizeNodeIdentifier(compressedId);
		const recompressedId = manager.localizeNodeIdentifier(decompressedId);
		assert.equal(compareLocalNodeIdentifiers(compressedId, recompressedId), 0);
	});

	itNodeKeyManager("are equatable when compressed", (manager) => {
		const idA = manager.generateLocalNodeIdentifier();
		const idB = manager.generateLocalNodeIdentifier();
		assert.equal(compareLocalNodeIdentifiers(idA, idA), 0);
		assert.notEqual(compareLocalNodeIdentifiers(idA, idB), 0);
	});

	itNodeKeyManager("are comparable when compressed", (manager) => {
		const idA = manager.generateLocalNodeIdentifier();
		const idB = manager.generateLocalNodeIdentifier();
		const idC = manager.generateLocalNodeIdentifier();
		const sorts = [
			[idA, idB, idC].sort(compareLocalNodeIdentifiers),
			[idA, idC, idB].sort(compareLocalNodeIdentifiers),
			[idB, idA, idC].sort(compareLocalNodeIdentifiers),
			[idB, idC, idA].sort(compareLocalNodeIdentifiers),
			[idC, idA, idB].sort(compareLocalNodeIdentifiers),
			[idC, idB, idA].sort(compareLocalNodeIdentifiers),
		];
		for (let i = 1; i < sorts.length; i++) {
			assert.deepEqual(sorts[i - 1], sorts[i]);
		}
	});
});
