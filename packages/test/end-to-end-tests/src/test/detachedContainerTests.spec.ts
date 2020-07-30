/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory, AttachState } from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { IFluidDataStoreContext, IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    LocalCodeLoader,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { v4 as uuid } from "uuid";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { Deferred } from "@fluidframework/common-utils";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { Ink, IColor } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedCell } from "@fluidframework/cell";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { MergeTreeDeltaType } from "@fluidframework/merge-tree";
import { MessageType } from "@fluidframework/protocol-definitions";
import { ComponentMessageType } from "@fluidframework/component-runtime";
import { ContainerMessageType } from "@fluidframework/container-runtime";

describe("Detached Container", () => {
    const documentId = "detachedContainerTest";
    const pkg: IFluidCodeDetails = {
        package: "detachedContainerTestPackage",
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

    let request: IRequest;
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;

    const createAndAttachDataStore = (async (
        componentContext: IFluidDataStoreContext,
        componentId: string,
        type: string,
    ) => {
        const doc = await componentContext._createDataStore(componentId, type);
        doc.bindToContext();
    });

    function createTestLoader(urlResolver: IUrlResolver): Loader {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory([
            [sharedStringId, SharedString.getFactory()],
            [sharedMapId, SharedMap.getFactory()],
            [crcId, ConsensusRegisterCollection.getFactory()],
            [sharedDirectoryId, SharedDirectory.getFactory()],
            [sharedCellId, SharedCell.getFactory()],
            [sharedInkId, Ink.getFactory()],
            [sharedMatrixId, SharedMatrix.getFactory()],
            [cocId, ConsensusQueue.getFactory()],
            [sparseMatrixId, SparseMatrix.getFactory()],
        ]);
        const codeLoader = new LocalCodeLoader([[pkg, factory]]);
        const documentServiceFactory = new LocalDocumentServiceFactory(testDeltaConnectionServer);
        return new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        const urlResolver = new LocalResolver();
        request = urlResolver.createCreateNewRequest(documentId);
        loader = createTestLoader(urlResolver);
    });

    it("Create detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
        assert.strictEqual(container.closed, false, "Container should be open");
        assert.strictEqual(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.strictEqual(container.getQuorum().getMembers().size, 0, "Quorum should not contain any memebers");
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in disconnected state!!");
        assert.strictEqual(container.chaincodePackage.package, pkg.package,
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

    it("Components in detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        if (response.mimeType !== "fluid/object" && response.status !== 200) {
            assert.fail("Root component should be created in detached container");
        }
        const component = response.value as ITestFluidComponent;

        // Create a sub component of type TestFluidComponent and verify that it is attached.
        const subCompId = uuid();
        await createAndAttachDataStore(component.context, subCompId, "default");
        const subResponse = await container.request({ url: `/${subCompId}` });
        if (subResponse.mimeType !== "fluid/object" && subResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const subComponent = subResponse.value as ITestFluidComponent;
        assert.strictEqual(subComponent.context.storage, undefined, "No storage should be there!!");

        // Get the sub component's root channel and verify that it is attached.
        const testChannel = await subComponent.runtime.getChannel("root");
        assert.strictEqual(testChannel.isAttached(), false, "Channel should be detached!!");
        assert.strictEqual(subComponent.context.attachState, AttachState.Detached, "Component should be detached!!");
    });

    it("Components in attached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;

        // Create a sub component of type TestFluidComponent.
        const newComponentId = uuid();
        await createAndAttachDataStore(component.context, newComponentId, "default");

        // Now attach the container
        await container.attach(request);

        // Get the sub component and verify that it is attached.
        const testResponse = await container.request({ url: `/${newComponentId}` });
        if (testResponse.mimeType !== "fluid/object" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as ITestFluidComponent;
        assert.strictEqual(testComponent.runtime.IFluidHandleContext.isAttached, true,
            "Component should be attached!!");

        // Get the sub component's "root" channel and verify that it is attached.
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.strictEqual(testChannel.isAttached(), true, "Channel should be attached!!");

        assert.strictEqual(testComponent.context.attachState, AttachState.Attached, "Component should be attached!!");
    });

    it("Load attached container and check for components", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;

        // Create a sub component of type TestFluidComponent.
        const subCompId = uuid();
        await createAndAttachDataStore(component.context, subCompId, "default");

        // Now attach the container and get the sub component.
        await container.attach(request);
        const response1 = await container.request({ url: `/${subCompId}` });
        const subComponent1 = response1.value as ITestFluidComponent;

        // Now load the container from another loader.
        const urlResolver2 = new LocalResolver();
        const loader2 = createTestLoader(urlResolver2);
        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver2.getAbsoluteUrl(container.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sub component and assert that it is attached.
        const response2 = await container2.request({ url: `/${subCompId}` });
        const subComponent2 = response2.value as ITestFluidComponent;
        assert.strictEqual(subComponent2.runtime.IFluidHandleContext.isAttached, true,
            "Component should be attached!!");

        // Verify the attributes of the root channel of both sub components.
        const testChannel1 = await subComponent1.runtime.getChannel("root");
        const testChannel2 = await subComponent2.runtime.getChannel("root");
        assert.strictEqual(testChannel2.isAttached(), true, "Channel should be attached!!");
        assert.strictEqual(JSON.stringify(testChannel2.snapshot()), JSON.stringify(testChannel1.snapshot()),
            "Value for snapshot should be same!!");
        assert.strictEqual(testChannel2.isAttached(), testChannel1.isAttached(),
            "Value for isAttached should persist!!");
    });

    it("Fire ops during container attach for shared string", async () => {
        const ops = { pos1: 0, seg: "b", type: 0 };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.equal(type, MessageType.Operation);
            assert.equal(contents.type, ContainerMessageType.ComponentOp);

            assert.equal(contents.contents.contents.type, ComponentMessageType.ChannelOp);

            assert.strictEqual(contents.contents.contents.content.address,
                sharedStringId, "Address should be shared string");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(ops), "Ops should be equal");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<SharedString>(sharedStringId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedMapId, "Address should be shared map");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(ops), "Ops should be equal");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<SharedMap>(sharedMapId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.id,
                testChannelId, "Channel id should match");
            assert.strictEqual(contents.contents.contents.content.type,
                SharedMap.getFactory().type, "Channel type should match");
            assert.strictEqual(contents.contents.contents.type, ComponentMessageType.Attach,
                "Op should be an attach op");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;

        const containerP = container.attach(request);

        // Fire attach op
        const testChannel = component.runtime.createChannel(testChannelId, SharedMap.getFactory().type);
        testChannel.handle.attachGraph();
        await containerP;
        await defPromise.promise;
    });

    it("Fire component attach ops during container attach", async () => {
        const testComponentType = "default";
        // eslint-disable-next-line prefer-const
        let peerComponentRuntimeChannel: IFluidDataStoreChannel;
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(type, MessageType.Operation, "Op should be an attach op");
            assert.strictEqual(contents.type, ContainerMessageType.Attach, "Op should be an attach op");
            assert.strictEqual(contents.contents.id,
                peerComponentRuntimeChannel.id, "Component id should match");
            assert.strictEqual(contents.contents.type,
                testComponentType, "Component type should match");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;

        const containerP = container.attach(request);
        peerComponentRuntimeChannel = await (component.context.containerRuntime as IContainerRuntime)
            .createDataStoreWithRealizationFn([testComponentType]);
        // Fire attach op
        peerComponentRuntimeChannel.bindToContext();
        await containerP;
        await defPromise.promise;
    });

    it("Fire ops during container attach for consensus register collection", async () => {
        const op = { key: "1", type: "write", serializedValue: JSON.stringify("b"), refSeq: 0 };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(pkg);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                crcId, "Address should be consensus register collection");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<ConsensusRegisterCollection<string>>(crcId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedDirectoryId, "Address should be shared directory");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<SharedDirectory>(sharedDirectoryId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedCellId, "Address should be shared directory");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<SharedCell>(sharedCellId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
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

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<Ink>(sharedInkId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                cocId, "Address should be consensus queue");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<ConsensusQueue>(cocId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
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

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<SparseMatrix>(sparseMatrixId);

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                sharedMatrixId, "Address should be shared matrix");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(op), "Op should be same");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;
        const testChannel1 = await component.getSharedObject<SharedMatrix>(sharedMatrixId);

        // Fire op before attaching the container
        testChannel1.insertRows(0, 20);
        testChannel1.insertCols(0, 20);
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.insertRows(0, 9);

        await containerP;
        await defPromise.promise;
    });

    afterEach(async () => {
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
