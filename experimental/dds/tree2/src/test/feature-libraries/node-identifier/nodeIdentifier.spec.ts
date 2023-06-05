/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IIdCompressor } from "@fluidframework/runtime-definitions";
import {
	CompressedNodeIdentifier,
	NodeIdentifier,
	NodeIdentifierManager,
	compareCompressedNodeIdentifiers,
	createMockNodeIdentifierManager,
	createNodeIdentifierManager,
} from "../../../feature-libraries";
import { TestTreeProvider } from "../../utils";

import { ISharedTree } from "../../../shared-tree";

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

describe("Node Identifiers", () => {
	function itNodeIdentifierManager(
		title: string,
		fn: (manager: NodeIdentifierManager) => void,
	): void {
		it(`${title} (mock)`, () => {
			fn(createMockNodeIdentifierManager());
		});
		it(`${title} (using IdCompressor)`, async () => {
			fn(createNodeIdentifierManager(await getIIDCompressor()));
		});
	}

	itNodeIdentifierManager("are unique", (manager) => {
		const ids = new Set<NodeIdentifier>();
		for (let i = 0; i < 50000; i++) {
			const id = manager.generateNodeIdentifier();
			assert(!ids.has(id));
			ids.add(id);
		}

		const compressedIds = new Set<CompressedNodeIdentifier>();
		for (let i = 0; i < 50000; i++) {
			const id = manager.generateCompressedNodeIdentifier();
			assert(!compressedIds.has(id));
			compressedIds.add(id);
		}
	});

	itNodeIdentifierManager("can be compressed and decompressed", (manager) => {
		const id = manager.generateNodeIdentifier();
		const compressedId = manager.compressNodeIdentifier(id);
		const decompressedId = manager.decompressNodeIdentifier(compressedId);
		assert.equal(id, decompressedId);
	});

	itNodeIdentifierManager("can be decompressed and compressed", (manager) => {
		const compressedId = manager.generateCompressedNodeIdentifier();
		const decompressedId = manager.decompressNodeIdentifier(compressedId);
		const recompressedId = manager.compressNodeIdentifier(decompressedId);
		assert.equal(compareCompressedNodeIdentifiers(compressedId, recompressedId), 0);
	});

	itNodeIdentifierManager("are equatable when compressed", (manager) => {
		const idA = manager.generateCompressedNodeIdentifier();
		const idB = manager.generateCompressedNodeIdentifier();
		assert.equal(compareCompressedNodeIdentifiers(idA, idA), 0);
		assert.notEqual(compareCompressedNodeIdentifiers(idA, idB), 0);
	});

	itNodeIdentifierManager("are comparable when compressed", (manager) => {
		const idA = manager.generateCompressedNodeIdentifier();
		const idB = manager.generateCompressedNodeIdentifier();
		const idC = manager.generateCompressedNodeIdentifier();
		const sorts = [
			[idA, idB, idC].sort(compareCompressedNodeIdentifiers),
			[idA, idC, idB].sort(compareCompressedNodeIdentifiers),
			[idB, idA, idC].sort(compareCompressedNodeIdentifiers),
			[idB, idC, idA].sort(compareCompressedNodeIdentifiers),
			[idC, idA, idB].sort(compareCompressedNodeIdentifiers),
			[idC, idB, idA].sort(compareCompressedNodeIdentifiers),
		];
		for (let i = 1; i < sorts.length; i++) {
			assert.deepEqual(sorts[i - 1], sorts[i]);
		}
	});
});
