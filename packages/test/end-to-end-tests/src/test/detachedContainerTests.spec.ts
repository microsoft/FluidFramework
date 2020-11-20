/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import {
    ChannelFactoryRegistry,
    ITestFluidObject,
} from "@fluidframework/test-utils";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { Deferred } from "@fluidframework/common-utils";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { Ink, IColor } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedCell } from "@fluidframework/cell";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { MergeTreeDeltaType } from "@fluidframework/merge-tree";
import { MessageType, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { DataStoreMessageType } from "@fluidframework/datastore";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ILocalTestObjectProvider,
    generateLocalTest,
    generateLocalNonCompatTest,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "./compatUtils";

const detachedContainerRefSeqNumber = 0;

const documentId = "detachedContainerTest";

const sharedStringId = "ss1Key";
const sharedMapId = "sm1Key";
const crcId = "crc1Key";
const cocId = "coc1Key";
const sharedDirectoryId = "sd1Key";
const sharedCellId = "scell1Key";
const sharedMatrixId = "smatrix1Key";
const sharedInkId = "sink1Key";
const sparseMatrixId = "sparsematrixKey";

const registry: ChannelFactoryRegistry = [
    [sharedStringId, SharedString.getFactory()],
    [sharedMapId, SharedMap.getFactory()],
    [crcId, ConsensusRegisterCollection.getFactory()],
    [sharedDirectoryId, SharedDirectory.getFactory()],
    [sharedCellId, SharedCell.getFactory()],
    [sharedInkId, Ink.getFactory()],
    [sharedMatrixId, SharedMatrix.getFactory()],
    [cocId, ConsensusQueue.getFactory()],
    [sparseMatrixId, SparseMatrix.getFactory()],
];

const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const tests = (args: ILocalTestObjectProvider) => {
    let request: IRequest;
    let loader: Loader;
    const pkg = args.defaultCodeDetails;

    const createFluidObject = (async (
        dataStoreContext: IFluidDataStoreContext,
        type: string,
    ) => {
        return requestFluidObject<ITestFluidObject>(
            await dataStoreContext.containerRuntime.createDataStore(type),
            "");
    });

    beforeEach(async () => {
        request = args.urlResolver.createCreateNewRequest(documentId);
        loader = args.makeTestLoader(testContainerConfig) as Loader;
    });

    it("Create detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
        assert.strictEqual(container.closed, false, "Container should be open");
        assert.strictEqual(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.strictEqual(container.getQuorum().getMembers().size, 0, "Quorum should not contain any members");
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in disconnected state!!");
        assert.strictEqual(container.chaincodePackage?.package, pkg.package,
            "Package should be same as provided");
        assert.strictEqual(container.id, "", "Detached container's id should be empty string");
        assert.strictEqual(container.clientDetails.capabilities.interactive, true,
            "Client details should be set with interactive as true");
    });

    it("Attach detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        await container.attach(request);
        assert.strictEqual(container.attachState, AttachState.Attached, "Container should be attached");
        assert.strictEqual(container.closed, false, "Container should be open");
        assert.strictEqual(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.strictEqual(container.id, documentId, "Doc id is not matching!!");
    });

    it("DataStores in detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        if (response.mimeType !== "fluid/object" && response.status !== 200) {
            assert.fail("Root dataStore should be created in detached container");
        }
        const dataStore = response.value as ITestFluidObject;

        // Create a sub dataStore of type TestFluidObject and verify that it is attached.
        const subDataStore = await createFluidObject(dataStore.context, "default");
        dataStore.root.set("attachKey", subDataStore.handle);
        assert.strictEqual(subDataStore.context.storage, undefined, "No storage should be there!!");

        // Get the sub dataStore's root channel and verify that it is attached.
        const testChannel = await subDataStore.runtime.getChannel("root");
        assert.strictEqual(testChannel.isAttached(), false, "Channel should be detached!!");
        assert.strictEqual(subDataStore.context.attachState, AttachState.Detached, "DataStore should be detached!!");
    });

    it("DataStores in attached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;

        // Create a sub dataStore of type TestFluidObject.
        const testDataStore = await createFluidObject(dataStore.context, "default");
        dataStore.root.set("attachKey", testDataStore.handle);

        // Now attach the container
        await container.attach(request);

        assert(testDataStore.runtime.attachState !== AttachState.Detached,
            "DataStore should be attached!!");

        // Get the sub dataStore's "root" channel and verify that it is attached.
        const testChannel = await testDataStore.runtime.getChannel("root");
        assert.strictEqual(testChannel.isAttached(), true, "Channel should be attached!!");

        assert.strictEqual(testDataStore.context.attachState, AttachState.Attached, "DataStore should be attached!!");
    });

    it("Load attached container and check for dataStores", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;

        // Create a sub dataStore of type TestFluidObject.
        const subDataStore1 = await createFluidObject(dataStore.context, "default");
        dataStore.root.set("attachKey", subDataStore1.handle);

        // Now attach the container and get the sub dataStore.
        await container.attach(request);

        // Now load the container from another loader.
        const loader2 = args.makeTestLoader(testContainerConfig);
        // Create a new request url from the resolvedUrl of the first container.
        assert(container.resolvedUrl);
        const requestUrl2 = await args.urlResolver.getAbsoluteUrl(container.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sub dataStore and assert that it is attached.
        const response2 = await container2.request({ url: `/${subDataStore1.context.id}` });
        const subDataStore2 = response2.value as ITestFluidObject;
        assert(subDataStore2.runtime.attachState !== AttachState.Detached,
            "DataStore should be attached!!");

        // Verify the attributes of the root channel of both sub dataStores.
        const testChannel1 = await subDataStore1.runtime.getChannel("root");
        const testChannel2 = await subDataStore2.runtime.getChannel("root");
        assert.strictEqual(testChannel2.isAttached(), true, "Channel should be attached!!");
        assert.strictEqual(JSON.stringify(testChannel2.snapshot()), JSON.stringify(testChannel1.snapshot()),
            "Value for snapshot should be same!!");
        assert.strictEqual(testChannel2.isAttached(), testChannel1.isAttached(),
            "Value for isAttached should persist!!");
    });

    it("ReAttach detached container on failed attach", async () => {
        const container = await loader.createDetachedContainer(pkg);
        const oldFunc = args.documentServiceFactory.createContainer;
        args.documentServiceFactory.createContainer = (a, b, c) => { throw new Error("Test Error"); };
        let failedOnce = false;
        try {
            await container.attach(request);
        } catch (e) {
            failedOnce = true;
            args.documentServiceFactory.createContainer = oldFunc;
        }
        assert.strictEqual(failedOnce, true, "Attach call should fail");
        assert.strictEqual(container.attachState, AttachState.Attaching, "Container should be in attaching state");
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;

        // Create a sub data store of type TestFluidObject.
        const dataStore1 = await createFluidObject(dataStore.context, "default");
        const defP = new Deferred();
        container.on("op", (op: ISequencedDocumentMessage) => {
            if (op.contents?.type === DataStoreMessageType.Attach) {
                assert.strictEqual(op.contents.contents.id, dataStore1.context.id,
                    "There should be an attach op for created data store");
                defP.resolve();
            }
        });
        dataStore1.channel.bindToContext();

        await container.attach(request);
        assert.strictEqual(container.attachState, AttachState.Attached, "Container should now be attached");
        await defP.promise;

        // Now load the container from another loader.
        const loader2 = args.makeTestLoader(testContainerConfig);
        // Create a new request url from the resolvedUrl of the first container.
        assert(container.resolvedUrl);
        const requestUrl2 = await args.urlResolver.getAbsoluteUrl(container.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sub data store and assert that it is attached.
        const response2 = await container2.request({ url: `/${dataStore1.context.id}` });
        const dataStore2 = response2.value as ITestFluidObject;
        assert(dataStore2, "Data store created in failed attach mode should exist");
        assert.strictEqual(dataStore1.runtime.attachState, AttachState.Attached, "Data store 1 should be attached");
        assert.strictEqual(dataStore2.runtime.attachState, AttachState.Attached, "Data store 2 should be attached");
    });

    it("Fire ops during container attach for shared string", async () => {
        const ops = { pos1: 0, seg: "b", type: 0 };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.equal(type, MessageType.Operation);
            assert.equal(contents.type, ContainerMessageType.FluidDataStoreOp);

            assert.equal(contents.contents.contents.type, DataStoreMessageType.ChannelOp);

            assert.strictEqual(contents.contents.contents.content.address,
                sharedStringId, "Address should be shared string");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(ops), "Ops should be equal");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<SharedString>(sharedStringId);

        // Fire op before attaching the container
        testChannel1.insertText(0, "a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.insertText(0, "b");
        await containerP;

        await defPromise.promise;
    });

    it("Fire ops during container attach for shared map", async () => {
        const ops = { key: "1", type: "set", value: { type: "Plain", value: "b" } };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedMapId, "Address should be shared map");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(ops), "Ops should be equal");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<SharedMap>(sharedMapId);

        // Fire op before attaching the container
        testChannel1.set("0", "a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.set("1", "b");
        await containerP;

        await defPromise.promise;
    });

    it("Fire channel attach ops during container attach", async () => {
        const testChannelId = "testChannel1";
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.id,
                testChannelId, "Channel id should match");
            assert.strictEqual(contents.contents.contents.content.type,
                SharedMap.getFactory().type, "Channel type should match");
            assert.strictEqual(contents.contents.contents.type, DataStoreMessageType.Attach,
                "Op should be an attach op");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;

        const containerP = container.attach(request);

        // Fire attach op
        const testChannel = dataStore.runtime.createChannel(testChannelId, SharedMap.getFactory().type);
        testChannel.handle.attachGraph();
        await containerP;
        await defPromise.promise;
    });

    it("Fire dataStore attach ops during container attach", async () => {
        const testDataStoreType = "default";
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;

        const containerP = container.attach(request);
        const router = await dataStore.context.containerRuntime.createDataStore([testDataStoreType]);
        const comp2 = await requestFluidObject<ITestFluidObject>(router, "/");

        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(type, MessageType.Operation, "Op should be an attach op");
            assert.strictEqual(contents.type, ContainerMessageType.Attach, "Op should be an attach op");
            assert.strictEqual(contents.contents.id,
                comp2.context.id, "DataStore id should match");
            assert.strictEqual(contents.contents.type,
                testDataStoreType, "DataStore type should match");
            defPromise.resolve();
            return 0;
        };

        // Fire attach op
        dataStore.root.set("attachComp", comp2.handle);
        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for consensus register collection", async () => {
        const op = {
            key: "1",
            type: "write",
            serializedValue: JSON.stringify("b"),
            refSeq: detachedContainerRefSeqNumber,
        };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                crcId, "Address should be consensus register collection");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);

        // Fire op before attaching the container
        await testChannel1.write("0", "a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        testChannel1.write("1", "b");
        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for shared directory", async () => {
        const op = {
            key: "1",
            path: "/",
            type: "set",
            value: { type: "Plain", value: "b" },
        };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedDirectoryId, "Address should be shared directory");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);

        // Fire op before attaching the container
        testChannel1.set("0", "a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.set("1", "b");
        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for shared cell", async () => {
        const op = { type: "setCell", value: { type: "Plain", value: "b" } };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedCellId, "Address should be shared directory");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<SharedCell>(sharedCellId);

        // Fire op before attaching the container
        testChannel1.set("a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.set("b");
        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for shared ink", async () => {
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedInkId, "Address should be ink");
            assert.strictEqual(contents.contents.contents.content.contents.type,
                "createStroke", "Op type should be same");
            assert.strictEqual(contents.contents.contents.content.contents.pen.thickness,
                20, "Thickness should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<Ink>(sharedInkId);

        // Fire op before attaching the container
        const color: IColor = {
            a: 2, r: 127, b: 127, g: 127,
        };
        testChannel1.createStroke({ color, thickness: 10 });
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.createStroke({ color, thickness: 20 });
        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for consensus ordered collection", async () => {
        const op = { opName: "add", value: JSON.stringify("s") };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                cocId, "Address should be consensus queue");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<ConsensusQueue>(cocId);

        // Fire op before attaching the container
        await testChannel1.add("a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        testChannel1.add("s");

        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for sparse matrix", async () => {
        const seg = { items: ["s"] };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sparseMatrixId, "Address should be sparse matrix");
            if (contents.contents.contents.content.contents.ops[0].type === MergeTreeDeltaType.INSERT) {
                assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents.ops[0].seg),
                    JSON.stringify(seg), "Seg should be same");
            } else {
                assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents.ops[1].seg),
                    JSON.stringify(seg), "Seg should be same");
            }
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<SparseMatrix>(sparseMatrixId);

        // Fire op before attaching the container
        testChannel1.insertRows(0, 1);
        testChannel1.insertCols(0, 1);
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.setItems(0, 0, seg.items);

        await containerP;
        await defPromise.promise;
    });

    it.skip("Fire ops during container attach for shared matrix", async () => {
        const op = { pos1: 0, seg: 9, type: 0, target: "rows" };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedMatrixId, "Address should be shared matrix");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const dataStore = response.value as ITestFluidObject;
        const testChannel1 = await dataStore.getSharedObject<SharedMatrix>(sharedMatrixId);

        // Fire op before attaching the container
        testChannel1.insertRows(0, 20);
        testChannel1.insertCols(0, 20);
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.insertRows(0, 9);

        await containerP;
        await defPromise.promise;
    });
};

describe("Detached Container", () => {
    generateLocalTest(tests);

    // non compat test
    generateLocalNonCompatTest((args: ILocalTestObjectProvider) => {
        let request: IRequest;
        let loader: Loader;
        const pkg = args.defaultCodeDetails;

        beforeEach(async () => {
            request = args.urlResolver.createCreateNewRequest(documentId);
            loader = args.makeTestLoader(testContainerConfig) as Loader;
        });

        it("Load attached container from cache and check if they are same", async () => {
            const container = await loader.createDetachedContainer(pkg);

            // Now attach the container and get the sub dataStore.
            await container.attach(request);

            // Create a new request url from the resolvedUrl of the first container.
            assert(container.resolvedUrl);
            const requestUrl2 = await args.urlResolver.getAbsoluteUrl(container.resolvedUrl, "");
            const container2 = await loader.resolve({ url: requestUrl2 });
            assert.strictEqual(container, container2, "Both containers should be same");
        });
    });
});
