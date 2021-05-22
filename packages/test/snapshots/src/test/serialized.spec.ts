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
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { SharedCell } from "@fluidframework/cell";
import { Ink } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedCounter } from "@fluidframework/counter";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { ConsensusQueue, ConsensusOrderedCollection } from "@fluidframework/ordered-collection";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";

describeNoCompat(`Dehydrate Rehydrate Container Test`, (getTestObjectProvider) => {
    const loaderContainerTracker = new LoaderContainerTracker();
    let disableIsolatedChannels = false;

    function tests(): void {
        it("Rehydrate container from saved snapshot and check contents before attach", async () => {
            const snapshotTree = fs.readFileSync("content/serializedContainerTestContent/serializedContainer.json", "utf8");

            const loader = createTestLoader();
            const container = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

            // Check for default data store
            const response = await container.request({ url: "/" });
            assert.strictEqual(response.status, 200, "Component should exist!!");
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
            const provider = getTestObjectProvider();

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
                urlResolver: provider.urlResolver,
                documentServiceFactory: provider.documentServiceFactory,
                codeLoader,
                logger: ChildLogger.create(getTestLogger?.(), undefined, {all: {driverType: provider.driver.type}}),
            });
            loaderContainerTracker.add(testLoader);
            return testLoader;
        }
    }

    tests();
    disableIsolatedChannels = true;
    tests();
});
