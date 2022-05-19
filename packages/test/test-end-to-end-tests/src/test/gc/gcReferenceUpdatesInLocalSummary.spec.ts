/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedMatrix } from "@fluidframework/matrix";
import { Marker, ReferenceType, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { SharedString } from "@fluidframework/sequence";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    private readonly matrixKey = "matrix";
    public matrix!: SharedMatrix;
    public undoRedoStackManager!: UndoRedoStackManager;

    private readonly sharedStringKey = "sharedString";
    public sharedString!: SharedString;

    protected async initializingFirstTime() {
        const sharedMatrix = SharedMatrix.create(this.runtime);
        this.root.set(this.matrixKey, sharedMatrix.handle);

        const sharedString = SharedString.create(this.runtime);
        this.root.set(this.sharedStringKey, sharedString.handle);
    }

    protected async hasInitialized() {
        const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
        assert(matrixHandle !== undefined, "SharedMatrix not found");
        this.matrix = await matrixHandle.get();

        this.undoRedoStackManager = new UndoRedoStackManager();
        this.matrix.insertRows(0, 3);
        this.matrix.insertCols(0, 3);
        this.matrix.openUndo(this.undoRedoStackManager);

        const sharedStringHandle = this.root.get<IFluidHandle<SharedString>>(this.sharedStringKey);
        assert(sharedStringHandle !== undefined, "SharedMatrix not found");
        this.sharedString = await sharedStringHandle.get();
    }
}

/**
 * Validates this scenario: When all references to a data store are deleted, the data store is marked as unreferenced
 * in the next summary. When a reference to the data store is re-added, it is marked as referenced in the next summary.
 * Basically, if the handle to a data store is not stored in any DDS, its summary tree will have the "unreferenced"
 * property set to true. If the handle to a data store exists or it's a root data store, its summary tree does not have
 * the "unreferenced" property.
 */
describeFullCompat("GC reference updates in local summary", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [SharedMatrix.getFactory(), SharedString.getFactory()],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true },
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    let containerRuntime: ContainerRuntime;
    let mainDataStore: TestDataObject;

    /**
     * Validates that the data store with the given id is represented correctly in the summary.
     * For referenced data stores:
     *   - The unreferenced property in its entry in the summary should be undefined.
     * For unreferenced data stores:
     *   - The unreferenced property in its entry in the summary should be true.
     */
    async function validateDataStoreInSummary(dataStoreId: string, referenced: boolean) {
        await provider.ensureSynchronized();
        const { summary } = await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });

        let dataStoreTree: ISummaryTree | undefined;
        const channelsTree = (summary.tree[".channels"] as ISummaryTree)?.tree ?? summary.tree;
        for (const [id, summaryObject] of Object.entries(channelsTree)) {
            if (id === dataStoreId) {
                assert(
                    summaryObject.type === SummaryType.Tree,
                    `Data store ${dataStoreId}'s entry is not a tree`,
                );
                dataStoreTree = summaryObject;
                break;
            }
        }

        assert(dataStoreTree !== undefined, `Data store ${dataStoreId} tree not in summary`);

        if (referenced) {
            assert(dataStoreTree.unreferenced === undefined, `Data store ${dataStoreId} should be referenced`);
        } else {
            assert(dataStoreTree.unreferenced === true, `Data store ${dataStoreId} should be unreferenced`);
        }
    }

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);

    before(function() {
        provider = getTestObjectProvider();
        // These tests validate the GC state in summary by calling summarize directly on the container runtime.
        // They do not post these summaries or download them. So, it doesn't need to run against real services.
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    beforeEach(async () => {
        const container = await createContainer();
        mainDataStore = await requestFluidObject<TestDataObject>(container, "/");
        containerRuntime = mainDataStore._context.containerRuntime as ContainerRuntime;
    });

    describe("SharedMatrix", () => {
        it("should reflect handle updates with undo / redo immediately in the next summary", async () => {
            // Create a second data store (dataStore2).

            const dataStore2 = await factory.createInstance(containerRuntime);
            // Add the handle of dataStore2 to the matrix to mark it as referenced.
            {
                mainDataStore.matrix.setCell(0, 0, dataStore2.handle);
                await validateDataStoreInSummary(dataStore2.id, true /* referenced */);
                mainDataStore.undoRedoStackManager.closeCurrentOperation();
            }

            // Remove its handle and verify its marked as unreferenced.
            {
                mainDataStore.matrix.removeCols(0, 1);
                await validateDataStoreInSummary(dataStore2.id, false /* referenced */);
            }

            // Undo column remove so that its marked as referenced again.
            {
                mainDataStore.undoRedoStackManager.undoOperation();
                await validateDataStoreInSummary(dataStore2.id, true /* referenced */);
            }

            // Redo column remove so that its marked as unreferenced again.
            {
                mainDataStore.undoRedoStackManager.redoOperation();
                await validateDataStoreInSummary(dataStore2.id, false /* referenced */);
            }
        });
    });

    describe("SharedString", () => {
        it("should reflect handle updates immediately in the next summary", async () => {
            // Create a second data store (dataStore2).
            const dataStore2 = await factory.createInstance(containerRuntime);

            // Add the handle of dataStore2 to the shared string to mark it as referenced.
            {
                mainDataStore.sharedString.insertText(0, "Hello");
                mainDataStore.sharedString.insertMarker(
                    0,
                    ReferenceType.Simple,
                    {
                        [reservedMarkerIdKey]: "markerId",
                        ["handle"]: dataStore2.handle,
                    },
                );
                await validateDataStoreInSummary(dataStore2.id, true /* referenced */);
            }

            // Remove its handle and verify its marked as unreferenced.
            {
                const marker = mainDataStore.sharedString.getMarkerFromId("markerId") as Marker;
                mainDataStore.sharedString.annotateMarker(
                    marker,
                    {
                        ["handle"]: "",
                    },
                );
                await validateDataStoreInSummary(dataStore2.id, false /* referenced */);
            }

            // Add the handle back and verify its marked as referenced.
            {
                const marker = mainDataStore.sharedString.getMarkerFromId("markerId") as Marker;
                mainDataStore.sharedString.annotateMarker(
                    marker,
                    {
                        ["handle"]: dataStore2.handle,
                    },
                );
                await validateDataStoreInSummary(dataStore2.id, true /* referenced */);
            }
        });
    });
});
