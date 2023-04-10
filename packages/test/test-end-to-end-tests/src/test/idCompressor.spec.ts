/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { SharedCell } from "@fluidframework/cell";
import { IIdCompressor, SessionSpaceCompressedId } from "@fluidframework/runtime-definitions";
import { SharedObjectCore } from "@fluidframework/shared-object-base";

const mapId = "mapKey";
const cellId = "cellKey";
const testContainerConfig: ITestContainerConfig = {
	registry: [
		[mapId, SharedMap.getFactory()],
		[cellId, SharedCell.getFactory()],
	],
	runtimeOptions: {
		enableRuntimeIdCompressor: true,
	},
	fluidDataObjectType: DataObjectFactoryType.Test,
};

function getIdCompressor(dds: SharedObjectCore): IIdCompressor {
	return (dds as any).runtime.idCompressor as IIdCompressor;
}

describeNoCompat("Runtime IdCompressor", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let sharedMapContainer1: SharedMap;
	let SharedCellContainer1: SharedCell;
	let sharedMapContainer2: SharedMap;
	let sharedMapContainer3: SharedMap;

	beforeEach(async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		sharedMapContainer1 = await dataObject1.getSharedObject<SharedMap>(mapId);
		SharedCellContainer1 = await dataObject1.getSharedObject<SharedCell>(cellId);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		sharedMapContainer2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
		sharedMapContainer3 = await dataObject3.getSharedObject<SharedMap>(mapId);

		sharedMapContainer1.set("testKey1", "testValue");

		await provider.ensureSynchronized();
	});

	it("has no compressor if not enabled", async () => {
		provider.reset();
		const config: ITestContainerConfig = {
			registry: [
				[mapId, SharedMap.getFactory()],
				[cellId, SharedCell.getFactory()],
			],
			fluidDataObjectType: DataObjectFactoryType.Test,
		};
		const container1 = await provider.makeTestContainer(config);
		const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		const map = await dataObject1.getSharedObject<SharedMap>(mapId);

		assert(getIdCompressor(map) === undefined);
	});

	it("can normalize session space IDs to op space", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedMapContainer2) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedMapContainer3) !== undefined, "IdCompressor is undefined");

		// None of these clusters will be ack'd yet and as such they will all
		// generate local Ids. State of compressors afterwards should be:
		// SharedMap1 Compressor: Local IdRange { first: -1, last: -512 }
		// SharedMap2 Compressor: Local IdRange { first: -1, last: -512 }
		// SharedMap3 Compressor: Local IdRange { first: -1, last: -512 }
		for (let i = 0; i < 512; i++) {
			getIdCompressor(sharedMapContainer1).generateCompressedId();
			getIdCompressor(sharedMapContainer2).generateCompressedId();
			getIdCompressor(sharedMapContainer3).generateCompressedId();
		}

		// Validate the state described above: all compressors should normalize to
		// local, negative ids as they haven't been ack'd and can't eagerly allocate
		for (let i = 0; i < 512; i++) {
			assert.strictEqual(
				getIdCompressor(sharedMapContainer1).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				-(i + 1),
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer2).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				-(i + 1),
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer3).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				-(i + 1),
			);
		}

		// Generate DDS ops so that the compressors synchronize
		sharedMapContainer1.set("key", "value");
		sharedMapContainer2.set("key2", "value2");
		sharedMapContainer3.set("key3", "value3");

		await provider.ensureSynchronized();

		// After synchronization, each compressor should allocate a cluster. Because the order is deterministic
		// in e2e tests, we can directly validate the cluster ranges. After synchronizing, each compressor will
		// get a positive id cluster that corresponds to its locally allocated ranges. Compressor states after synchronizing:
		// SharedMap1 Compressor: { first: 0, last: 511 }
		// SharedMap2 Compressor: { first: 512, last: 1023 }
		// SharedMap3 Compressor: { first: 1024, last: 1535 }
		for (let i = 0; i < 512; i++) {
			assert.strictEqual(
				getIdCompressor(sharedMapContainer1).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				i,
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer2).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				i + 512,
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer3).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				i + 1024,
			);
		}

		assert.strictEqual(sharedMapContainer1.get("key"), "value");
		assert.strictEqual(sharedMapContainer2.get("key2"), "value2");
		assert.strictEqual(sharedMapContainer3.get("key3"), "value3");
	});

	it("can normalize local op space IDs from a local session to session space", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		const sessionSpaceId = getIdCompressor(sharedMapContainer1).generateCompressedId();
		sharedMapContainer1.set("key", "value");

		await provider.ensureSynchronized();
		const opSpaceId = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(sessionSpaceId);
		const normalizedSessionSpaceId = getIdCompressor(
			sharedMapContainer1,
		).normalizeToSessionSpace(opSpaceId, getIdCompressor(sharedMapContainer1).localSessionId);

		assert.strictEqual(opSpaceId, 0);
		assert.strictEqual(normalizedSessionSpaceId, -1);
	});

	it("eagerly allocates final IDs after cluster is finalized", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		const localId1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(localId1, -1);
		const localId2 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(localId2, -2);

		sharedMapContainer1.set("key", "value");
		await provider.ensureSynchronized();

		const finalId3 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(finalId3, 2);

		sharedMapContainer1.set("key2", "value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId1);
		const opSpaceId2 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId2);
		const opSpaceId3 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(finalId3);

		assert.strictEqual(opSpaceId1, 0);
		assert.strictEqual(opSpaceId2, 1);
		assert.strictEqual(opSpaceId3, 2);
		assert.strictEqual(finalId3, opSpaceId3);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId1,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			localId1,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId2,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			localId2,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId3,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			finalId3,
		);
	});

	it("eagerly allocates IDs across DDSs using the same compressor", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(SharedCellContainer1) !== undefined, "IdCompressor is undefined");

		const localId1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(localId1, -1);
		const localId2 = getIdCompressor(SharedCellContainer1).generateCompressedId();
		assert.strictEqual(localId2, -2);

		sharedMapContainer1.set("key", "value");
		SharedCellContainer1.set("value");
		await provider.ensureSynchronized();

		const finalId3 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(finalId3, 2);
		const finalId4 = getIdCompressor(SharedCellContainer1).generateCompressedId();
		assert.strictEqual(finalId4, 3);

		sharedMapContainer1.set("key2", "value2");
		SharedCellContainer1.set("value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId1);
		const opSpaceId2 = getIdCompressor(SharedCellContainer1).normalizeToOpSpace(localId2);
		const opSpaceId3 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(finalId3);
		const opSpaceId4 = getIdCompressor(SharedCellContainer1).normalizeToOpSpace(finalId4);

		assert.strictEqual(opSpaceId1, 0);
		assert.strictEqual(opSpaceId2, 1);
		assert.strictEqual(opSpaceId3, 2);
		assert.strictEqual(opSpaceId3, finalId3);
		assert.strictEqual(opSpaceId4, 3);
		assert.strictEqual(opSpaceId4, finalId4);

		assert.equal(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId1,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			localId1,
		);
		assert.equal(
			getIdCompressor(SharedCellContainer1).normalizeToSessionSpace(
				opSpaceId2,
				getIdCompressor(SharedCellContainer1).localSessionId,
			),
			localId2,
		);
		assert.equal(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId3,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			finalId3,
		);
		assert.equal(
			getIdCompressor(SharedCellContainer1).normalizeToSessionSpace(
				opSpaceId4,
				getIdCompressor(SharedCellContainer1).localSessionId,
			),
			finalId4,
		);
	});

	it("produces Id spaces correctly", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedMapContainer2) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedMapContainer3) !== undefined, "IdCompressor is undefined");

		const firstIdContainer1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		const secondIdContainer2 = getIdCompressor(sharedMapContainer2).generateCompressedId();
		const thirdIdContainer2 = getIdCompressor(sharedMapContainer2).generateCompressedId();
		const decompressedIds: string[] = [];

		const firstDecompressedIdContainer1 =
			getIdCompressor(sharedMapContainer1).decompress(firstIdContainer1);
		decompressedIds.push(firstDecompressedIdContainer1);
		sharedMapContainer1.set(firstDecompressedIdContainer1, "value1");

		[secondIdContainer2, thirdIdContainer2].forEach((id, index) => {
			assert(getIdCompressor(sharedMapContainer2) !== undefined, "IdCompressor is undefined");
			const decompressedId = getIdCompressor(sharedMapContainer2).decompress(id);
			decompressedIds.push(decompressedId);
			sharedMapContainer2.set(decompressedId, `value${index + 2}`);
		});

		// should be negative
		assert(
			getIdCompressor(sharedMapContainer1).normalizeToOpSpace(firstIdContainer1) < 0,
			"Expected op space id to be < 0",
		);
		assert(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(secondIdContainer2) < 0,
			"Expected op space id to be < 0",
		);
		assert(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(thirdIdContainer2) < 0,
			"Expected op space id to be < 0",
		);

		await provider.ensureSynchronized();

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToOpSpace(firstIdContainer1),
			0,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(secondIdContainer2),
			512,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(thirdIdContainer2),
			513,
		);

		decompressedIds.forEach((id, index) => {
			assert.equal(sharedMapContainer1.get(id), `value${index + 1}`);
			assert.equal(sharedMapContainer2.get(id), `value${index + 1}`);
		});
	});

	// IdCompressor is at container runtime level, which means that individual DDSs
	// in the same container should have the same underlying compressor state
	it("container with multiple DDSs has same compressor state", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(SharedCellContainer1) !== undefined, "IdCompressor is undefined");

		// 2 IDs in the map compressor, 1 in the cell compressor
		// should result in a local count of 3 IDs
		const sharedMapCompressedId = getIdCompressor(sharedMapContainer1).generateCompressedId();
		const sharedMapDecompressedId =
			getIdCompressor(sharedMapContainer1).decompress(sharedMapCompressedId);
		const sharedMapCompressedId2 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		const sharedMapDecompressedId2 =
			getIdCompressor(sharedMapContainer1).decompress(sharedMapCompressedId2);
		const sharedCellCompressedId = getIdCompressor(SharedCellContainer1).generateCompressedId();
		const sharedCellDecompressedId =
			getIdCompressor(sharedMapContainer1).decompress(sharedCellCompressedId);

		// Generate an op so the idCompressor state is actually synchronized
		// across clients
		sharedMapContainer1.set(sharedMapDecompressedId, "value");

		assert.strictEqual(
			(getIdCompressor(sharedMapContainer1) as any).localIdCount,
			(getIdCompressor(SharedCellContainer1) as any).localIdCount,
		);

		await provider.ensureSynchronized();

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).recompress(sharedMapDecompressedId),
			getIdCompressor(SharedCellContainer1).recompress(sharedMapDecompressedId),
		);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).recompress(sharedMapDecompressedId2),
			getIdCompressor(SharedCellContainer1).recompress(sharedMapDecompressedId2),
		);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).recompress(sharedCellDecompressedId),
			getIdCompressor(SharedCellContainer1).recompress(sharedCellDecompressedId),
		);

		assert.strictEqual(sharedMapContainer1.get(sharedMapDecompressedId), "value");
	});
});
