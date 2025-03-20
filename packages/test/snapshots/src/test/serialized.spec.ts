/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";

import { SparseMatrix } from "@fluid-experimental/sequence-deprecated";
import { SharedCell, ISharedCell } from "@fluidframework/cell/internal";
import { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import {
	rehydrateDetachedContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { SharedCounter } from "@fluidframework/counter/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { type ISharedMap, SharedMap, SharedDirectory } from "@fluidframework/map/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import {
	ConsensusOrderedCollection,
	ConsensusQueue,
} from "@fluidframework/ordered-collection/internal";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObject,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils/internal";

import { getTestContent, skipOrFailIfTestContentMissing } from "../testContent.js";

describe(`Container Serialization Backwards Compatibility`, () => {
	const loaderContainerTracker = new LoaderContainerTracker();
	const contentFolder = getTestContent("serializedContainerTestContent");

	// Ideally we would have each test call this.skip() but in this case they're created dynamically
	// based on the contents of the folder which might or might not exist, so this is the alternative
	// I came up with.
	if (!contentFolder.exists) {
		it(`dynamic tests in this suite - test collateral folder (${contentFolder.path}) doesn't exist`, function () {
			skipOrFailIfTestContentMissing(this, contentFolder);
		});
		return;
	}

	for (const filename of recurseFiles(contentFolder.path)) {
		tests(filename);
	}

	function tests(filename: string): void {
		const filenameShort = filename.slice(contentFolder.path.length + 1);
		it(`Rehydrate container from ${filenameShort} and check contents before attach`, async () => {
			const snapshotTree = fs.readFileSync(filename, "utf8");

			const loaderProps = createTestLoaderProps();
			const container = await rehydrateDetachedContainer({
				...loaderProps,
				serializedState: snapshotTree,
			});
			loaderContainerTracker.addContainer(container);

			// Check for default data store
			const entryPoint = await container.getEntryPoint();
			assert.notStrictEqual(entryPoint, undefined, `Component should exist!!`);
			const defaultDataStore = entryPoint as TestFluidObject;
			assert.strictEqual(defaultDataStore.runtime.id, "default", "Id should be default");

			// Check for dds
			const sharedMap = await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
			const sharedDir =
				await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
			const sharedString =
				await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
			const sharedCell = await defaultDataStore.getSharedObject<ISharedCell>(sharedCellId);
			const sharedCounter =
				await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
			const crc =
				await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
			const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
			const sharedMatrix =
				await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
			const sparseMatrix =
				await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
			assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
			assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
			assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
			assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
			assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
			assert.strictEqual(crc.id, crcId, "CRC should exist!!");
			assert.strictEqual(coc.id, cocId, "COC should exist!!");
			assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
			assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
		});

		it(`Rehydrate container from ${filenameShort} round trip serialize/deserialize`, async () => {
			const snapshotTree = fs.readFileSync(filename, "utf8");

			const loaderProps = createTestLoaderProps();
			const container1 = await rehydrateDetachedContainer({
				...loaderProps,
				serializedState: snapshotTree,
			});
			loaderContainerTracker.addContainer(container1);
			const snapshotTree2 = container1.serialize();
			const container2 = await rehydrateDetachedContainer({
				...loaderProps,
				serializedState: snapshotTree2,
			});
			loaderContainerTracker.addContainer(container2);

			// Check for default data store
			const entryPoint = await container2.getEntryPoint();
			assert.notStrictEqual(entryPoint, undefined, `Component should exist!!`);
			const defaultDataStore = entryPoint as TestFluidObject;
			assert.strictEqual(defaultDataStore.runtime.id, "default", "Id should be default");

			// Check for dds
			const sharedMap = await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
			const sharedDir =
				await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
			const sharedString =
				await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
			const sharedCell = await defaultDataStore.getSharedObject<ISharedCell>(sharedCellId);
			const sharedCounter =
				await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
			const crc =
				await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
			const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
			const sharedMatrix =
				await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
			const sparseMatrix =
				await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
			assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
			assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
			assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
			assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
			assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
			assert.strictEqual(crc.id, crcId, "CRC should exist!!");
			assert.strictEqual(coc.id, cocId, "COC should exist!!");
			assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
			assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
		});

		const codeDetails: IFluidCodeDetails = {
			package: "detachedContainerTestPackage1",
			config: {},
		};
		const sharedStringId = "ss1Key";
		const sharedMapId = "sm1Key";
		const crcId = "crc1Key";
		const cocId = "coc1Key";
		const sharedDirectoryId = "sd1Key";
		const sharedCellId = "scell1Key";
		const sharedMatrixId = "smatrix1Key";
		const sparseMatrixId = "sparsematrixKey";
		const sharedCounterId = "sharedcounterKey";

		function createTestLoaderProps(): ILoaderProps {
			const deltaConnectionServer = LocalDeltaConnectionServer.create();
			const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
			const urlResolver = new LocalResolver();

			const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
				[sharedStringId, SharedString.getFactory()],
				[sharedMapId, SharedMap.getFactory()],
				[crcId, ConsensusRegisterCollection.getFactory()],
				[sharedDirectoryId, SharedDirectory.getFactory()],
				[sharedCellId, SharedCell.getFactory()],
				[sharedMatrixId, SharedMatrix.getFactory()],
				[cocId, ConsensusQueue.getFactory()],
				[sparseMatrixId, SparseMatrix.getFactory()],
				[sharedCounterId, SharedCounter.getFactory()],
			]);
			const codeLoader = new LocalCodeLoader([[codeDetails, factory]], {});
			const testLoaderProps: ILoaderProps = {
				urlResolver,
				documentServiceFactory,
				codeLoader,
			};
			return testLoaderProps;
		}
	}
});

function* recurseFiles(rootPath: string): IterableIterator<string> {
	for (const child of fs.readdirSync(rootPath)) {
		const filenameFull = `${rootPath}/${child}`;
		const stat = fs.statSync(filenameFull);
		if (stat?.isDirectory()) {
			yield* recurseFiles(filenameFull);
		} else {
			yield filenameFull;
		}
	}
}
