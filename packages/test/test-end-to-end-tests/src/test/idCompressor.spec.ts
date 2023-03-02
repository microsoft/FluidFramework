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
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { SharedCell } from "@fluidframework/cell";
import { SessionSpaceCompressedId } from "@fluidframework/runtime-definitions";

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

describeNoCompat("Runtime IdCompressor", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let sharedMap1: SharedMap;
	let sharedCell1: SharedCell;
	let sharedMap2: SharedMap;
	let sharedMap3: SharedMap;

	beforeEach(async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);
		sharedCell1 = await dataObject1.getSharedObject<SharedCell>(cellId);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
		sharedMap3 = await dataObject3.getSharedObject<SharedMap>(mapId);

		sharedMap1.set("testKey1", "testValue");

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

		assert(map.idCompressor === undefined);
	});

	it("can normalize session space IDs to op space", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		assert(sharedMap2.idCompressor !== undefined);
		assert(sharedMap3.idCompressor !== undefined);

		const compressedIds: Map<SessionSpaceCompressedId, SharedMap> = new Map();
		for (let i = 0; i < 1024; i++) {
			compressedIds.set(sharedMap1.idCompressor.generateCompressedId(), sharedMap1);
			compressedIds.set(sharedMap2.idCompressor.generateCompressedId(), sharedMap1);
			compressedIds.set(sharedMap3.idCompressor.generateCompressedId(), sharedMap1);
		}

		for (const [id, map] of compressedIds) {
			assert(map.idCompressor !== undefined);
			assert(map.idCompressor?.normalizeToOpSpace(id) < 0);
		}

		// Generate DDS ops so that the compressor synchronize
		sharedMap1.set("key", "value");
		sharedMap2.set("key2", "value2");
		sharedMap3.set("key3", "value3");

		await provider.ensureSynchronized();

		for (const [id, map] of compressedIds) {
			assert(map.idCompressor !== undefined);
			assert(map.idCompressor.normalizeToOpSpace(id) >= 0);
		}

		assert.strictEqual(sharedMap1.get("key"), "value");
		assert.strictEqual(sharedMap2.get("key2"), "value2");
		assert.strictEqual(sharedMap3.get("key3"), "value3");
	});

	it("can normalize local op space IDs from a local session to session space", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		const sessionSpaceId = sharedMap1.idCompressor.generateCompressedId();
		sharedMap1.set("key", "value");

		await provider.ensureSynchronized();
		const opSpaceId = sharedMap1.idCompressor.normalizeToOpSpace(sessionSpaceId);
		const normalizedSessionSpaceId = sharedMap1.idCompressor.normalizeToSessionSpace(
			opSpaceId,
			sharedMap1.idCompressor.localSessionId,
		);

		assert(opSpaceId >= 0);
		assert(normalizedSessionSpaceId < 0);
	});

	it("eagerly allocates final IDs after cluster is finalized", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		const localId1 = sharedMap1.idCompressor.generateCompressedId();
		assert(localId1 < 0);
		const localId2 = sharedMap1.idCompressor.generateCompressedId();
		assert(localId2 < 0);

		sharedMap1.set("key", "value");
		await provider.ensureSynchronized();

		const finalId3 = sharedMap1.idCompressor.generateCompressedId();
		assert(finalId3 >= 0);

		sharedMap1.set("key2", "value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = sharedMap1.idCompressor.normalizeToOpSpace(localId1);
		const opSpaceId2 = sharedMap1.idCompressor.normalizeToOpSpace(localId2);
		const opSpaceId3 = sharedMap1.idCompressor.normalizeToOpSpace(finalId3);

		assert(opSpaceId1 >= 0);
		assert(opSpaceId2 >= 0);
		assert(opSpaceId3 >= 0 && opSpaceId3 === finalId3);

		assert.strictEqual(sharedMap1.idCompressor.normalizeToSessionSpace(opSpaceId1), localId1);
		assert.strictEqual(sharedMap1.idCompressor.normalizeToSessionSpace(opSpaceId2), localId2);
		assert.strictEqual(sharedMap1.idCompressor.normalizeToSessionSpace(opSpaceId3), finalId3);
	});

	it("eagerly allocates IDs across DDSs using the same compressor", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		assert(sharedCell1.idCompressor !== undefined);

		const localId1 = sharedMap1.idCompressor.generateCompressedId();
		assert(localId1 < 0);
		const localId2 = sharedCell1.idCompressor.generateCompressedId();
		assert(localId2 < 0);

		sharedMap1.set("key", "value");
		sharedCell1.set("value");
		await provider.ensureSynchronized();

		const finalId3 = sharedMap1.idCompressor.generateCompressedId();
		assert(finalId3 >= 0);
		const finalId4 = sharedCell1.idCompressor.generateCompressedId();
		assert(finalId4 >= 0);

		sharedMap1.set("key2", "value2");
		sharedCell1.set("value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = sharedMap1.idCompressor.normalizeToOpSpace(localId1);
		const opSpaceId2 = sharedCell1.idCompressor.normalizeToOpSpace(localId2);
		const opSpaceId3 = sharedMap1.idCompressor.normalizeToOpSpace(finalId3);
		const opSpaceId4 = sharedCell1.idCompressor.normalizeToOpSpace(finalId4);

		assert(opSpaceId1 >= 0);
		assert(opSpaceId2 >= 0);
		assert(opSpaceId3 >= 0 && opSpaceId3 === finalId3);
		assert(opSpaceId4 >= 0 && opSpaceId4 === finalId4);

		assert.equal(sharedMap1.idCompressor.normalizeToSessionSpace(opSpaceId1), localId1);
		assert.equal(sharedCell1.idCompressor.normalizeToSessionSpace(opSpaceId2), localId2);
		assert.equal(sharedMap1.idCompressor.normalizeToSessionSpace(opSpaceId3), finalId3);
		assert.equal(sharedCell1.idCompressor.normalizeToSessionSpace(opSpaceId4), finalId4);
	});

	it("produces Id spaces correctly", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		assert(sharedMap2.idCompressor !== undefined);
		assert(sharedMap3.idCompressor !== undefined);

		const firstId = sharedMap1.idCompressor.generateCompressedId();
		const secondId = sharedMap2.idCompressor.generateCompressedId();
		const thirdId = sharedMap2.idCompressor.generateCompressedId();
		const decompressedIds: string[] = [];

		const firstDecompressedId = sharedMap1.idCompressor.decompress(firstId);
		decompressedIds.push(firstDecompressedId);
		sharedMap1.set(firstDecompressedId, "value1");

		[secondId, thirdId].forEach((id, index) => {
			assert(sharedMap2.idCompressor !== undefined);
			const decompressedId = sharedMap2.idCompressor.decompress(id);
			decompressedIds.push(decompressedId);
			sharedMap2.set(decompressedId, `value${index + 2}`);
		});

		// should be negative
		assert(sharedMap1.idCompressor.normalizeToOpSpace(firstId) < 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(secondId) < 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(thirdId) < 0);

		await provider.ensureSynchronized();

		assert(sharedMap1.idCompressor.normalizeToOpSpace(firstId) > 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(secondId) > 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(thirdId) > 0);

		decompressedIds.forEach((id, index) => {
			assert.equal(sharedMap1.get(id), `value${index + 1}`);
			assert.equal(sharedMap2.get(id), `value${index + 1}`);
		});
	});

	// IdCompressor is at container runtime level, which means that individual DDSs
	// in the same container should have the same underlying compressor state
	it("container with multiple DDSs has same compressor state", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		assert(sharedCell1.idCompressor !== undefined);

		// 2 IDs in the map compressor, 1 in the cell compressor
		// should result in a local count of 3 IDs
		const sharedMapCompressedId = sharedMap1.idCompressor.generateCompressedId();
		const sharedMapDecompressedId = sharedMap1.idCompressor.decompress(sharedMapCompressedId);
		const sharedMapCompressedId2 = sharedMap1.idCompressor.generateCompressedId();
		const sharedMapDecompressedId2 = sharedMap1.idCompressor.decompress(sharedMapCompressedId2);
		const sharedCellCompressedId = sharedCell1.idCompressor.generateCompressedId();
		const sharedCellDecompressedId = sharedMap1.idCompressor.decompress(sharedCellCompressedId);

		// Generate an op so the idCompressor state is actually synchronized
		// across clients
		sharedMap1.set(sharedMapDecompressedId, "value");

		assert.strictEqual(
			(sharedMap1.idCompressor as any).localIdCount,
			(sharedCell1.idCompressor as any).localIdCount,
		);

		await provider.ensureSynchronized();

		assert.strictEqual(
			sharedMap1.idCompressor.recompress(sharedMapDecompressedId),
			sharedCell1.idCompressor.recompress(sharedMapDecompressedId),
		);

		assert.strictEqual(
			sharedMap1.idCompressor.recompress(sharedMapDecompressedId2),
			sharedCell1.idCompressor.recompress(sharedMapDecompressedId2),
		);

		assert.strictEqual(
			sharedMap1.idCompressor.recompress(sharedCellDecompressedId),
			sharedCell1.idCompressor.recompress(sharedCellDecompressedId),
		);

		assert.strictEqual(sharedMap1.get(sharedMapDecompressedId), "value");
	});
});
