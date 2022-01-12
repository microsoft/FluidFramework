/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";
import {
    Loader,
} from "@fluidframework/container-loader";
import {
    LocalCodeLoader,
    TestFluidObjectFactory,
    TestFluidObject,
    LoaderContainerTracker,
} from "@fluidframework/test-utils";
import {
    LocalDocumentServiceFactory,
    LocalResolver,
} from "@fluidframework/local-driver";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { SharedCell } from "@fluidframework/cell";
import { Ink } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedCounter } from "@fluidframework/counter";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { ConsensusQueue, ConsensusOrderedCollection } from "@fluidframework/ordered-collection";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

describe(`Container Serialization Backwards Compatibility`, () => {
    const loaderContainerTracker = new LoaderContainerTracker();
    let disableIsolatedChannels: boolean;
    let filename: string;
    const contentFolder = "content/serializedContainerTestContent";

    for (filename of recurseFiles(contentFolder)) {
        disableIsolatedChannels = false;
        tests();
        disableIsolatedChannels = true;
        tests();
    }

    function tests(): void {
        const filenameShort = filename.slice(contentFolder.length + 1);
        it(`Rehydrate container from ${filenameShort} and check contents before attach${
            disableIsolatedChannels ? " (disable isolated channels)" : ""}`, async () => {
            const snapshotTree = fs.readFileSync(filename, "utf8");

            const loader = createTestLoader();
            const container = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

            // Check for default data store
            const response = await container.request({ url: "/" });
            assert.strictEqual(response.status, 200, `Component should exist!! ${response.value}`);
            const defaultDataStore = response.value as TestFluidObject;
            assert.strictEqual(defaultDataStore.runtime.id, "default", "Id should be default");

            // Check for dds
            const sharedMap = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
            const sharedDir = await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
            const sharedString = await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
            const sharedCell = await defaultDataStore.getSharedObject<SharedCell>(sharedCellId);
            const sharedCounter = await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
            const crc = await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
            const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
            const ink = await defaultDataStore.getSharedObject<Ink>(sharedInkId);
            const sharedMatrix = await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
            const sparseMatrix = await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
            assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
            assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
            assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
            assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
            assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
            assert.strictEqual(crc.id, crcId, "CRC should exist!!");
            assert.strictEqual(coc.id, cocId, "COC should exist!!");
            assert.strictEqual(ink.id, sharedInkId, "Shared ink should exist!!");
            assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
            assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
        });

        it(`Rehydrate container from ${filenameShort} round trip serialize/deserialize${
            disableIsolatedChannels ? " (disable isolated channels)" : ""}`, async () => {
            const snapshotTree = fs.readFileSync(filename, "utf8");

            const loader = createTestLoader();
            const container1 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

            const snapshotTree2 = container1.serialize();
            const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree2);

            // Check for default data store
            const response = await container2.request({ url: "/" });
            assert.strictEqual(response.status, 200, `Component should exist!! ${response.value}`);
            const defaultDataStore = response.value as TestFluidObject;
            assert.strictEqual(defaultDataStore.runtime.id, "default", "Id should be default");

            // Check for dds
            const sharedMap = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
            const sharedDir = await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
            const sharedString = await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
            const sharedCell = await defaultDataStore.getSharedObject<SharedCell>(sharedCellId);
            const sharedCounter = await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
            const crc = await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
            const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
            const ink = await defaultDataStore.getSharedObject<Ink>(sharedInkId);
            const sharedMatrix = await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
            const sparseMatrix = await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
            assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
            assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
            assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
            assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
            assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
            assert.strictEqual(crc.id, crcId, "CRC should exist!!");
            assert.strictEqual(coc.id, cocId, "COC should exist!!");
            assert.strictEqual(ink.id, sharedInkId, "Shared ink should exist!!");
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
        const sharedInkId = "sink1Key";
        const sparseMatrixId = "sparsematrixKey";
        const sharedCounterId = "sharedcounterKey";

        function createTestLoader(): Loader {
            const deltaConnectionServer = LocalDeltaConnectionServer.create();
            const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
            const urlResolver = new LocalResolver();

            const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
                [sharedStringId, SharedString.getFactory()],
                [sharedMapId, SharedMap.getFactory()],
                [crcId, ConsensusRegisterCollection.getFactory()],
                [sharedDirectoryId, SharedDirectory.getFactory()],
                [sharedCellId, SharedCell.getFactory()],
                [sharedInkId, Ink.getFactory()],
                [sharedMatrixId, SharedMatrix.getFactory()],
                [cocId, ConsensusQueue.getFactory()],
                [sparseMatrixId, SparseMatrix.getFactory()],
                [sharedCounterId, SharedCounter.getFactory()],
            ]);
            const codeLoader = new LocalCodeLoader(
                [[codeDetails, factory]],
                { summaryOptions: { disableIsolatedChannels } });
            const testLoader = new Loader({
                urlResolver,
                documentServiceFactory,
                codeLoader,
            });
            loaderContainerTracker.add(testLoader);
            return testLoader;
        }
    }
});

function *recurseFiles(rootPath: string): IterableIterator<string> {
    for (const child of fs.readdirSync(rootPath)) {
        const filenameFull = `${rootPath}/${child}`;
        const stat = fs.statSync(filenameFull);
        if (stat && stat.isDirectory()) {
            yield *recurseFiles(filenameFull);
        } else {
            yield filenameFull;
        }
    }
}
