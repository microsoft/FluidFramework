/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { SharedMap } from "@fluidframework/map";
import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import {
    ReferenceType,
    reservedMarkerIdKey,
    reservedMarkerSimpleTypeKey,
    reservedTileLabelsKey,
} from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { getTextAndMarkers, SharedString } from "@fluidframework/sequence";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
    ChannelFactoryRegistry,
    ITestFluidObject,
    ITestContainerConfig,
    ITestObjectProvider,
    DataObjectFactoryType,
    createAndAttachContainer,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
import { bufferToString, Deferred, stringToBuffer } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";

const mapId = "map";
const stringId = "sharedStringKey";
const cellId = "cellKey";
const counterId = "counterKey";
const registry: ChannelFactoryRegistry = [
    [mapId, SharedMap.getFactory()],
    [stringId, SharedString.getFactory()],
    [cellId, SharedCell.getFactory()],
    [counterId, SharedCounter.getFactory()]];

const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
    runtimeOptions: {
        enableOfflineLoad: true,
        summaryOptions: {
            initialSummarizerDelayMs: 20, // Previous Containers had this property under SummaryOptions.
            summaryConfigOverrides: {
                ...DefaultSummaryConfiguration,
                ...{
                    maxTime: 5000 * 12,
                    maxAckWaitTime: 120000,
                    maxOps: 1,
                    initialSummarizerDelayMs: 20,
                },
            },
        },
    },
};

const lots = 30;
const testKey = "test key";
const testKey2 = "another test key";
const testValue = "test value";
const testIncrementValue = 5;

const ensureContainerConnected = async (container: IContainer) => {
    if (container.connectionState !== ConnectionState.Connected) {
        return new Promise<void>((resolve) => container.once("connected", () => resolve()));
    }
};

const getPendingStateWithoutClose = (container: IContainer): string => {
    const containerClose = container.close;
    container.close = (message) => assert(message === undefined);
    const pendingState = container.closeAndGetPendingLocalState();
    assert(typeof pendingState === "string");
    container.close = containerClose;
    return pendingState;
};

type MapCallback = (container: IContainer, dataStore: ITestFluidObject, map: SharedMap) => void | Promise<void>;

// load container, pause, create (local) ops from callback, then optionally send ops before closing container
const getPendingOps = async (args: ITestObjectProvider, send: boolean, cb: MapCallback = () => undefined) => {
    const container = await args.loadTestContainer(testContainerConfig);
    await ensureContainerConnected(container);
    const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
    const map = await dataStore.getSharedObject<SharedMap>(mapId);

    [...Array(lots).keys()].map((i) => dataStore.root.set(`make sure csn is > 1 so it doesn't hide bugs ${i}`, i));

    await args.ensureSynchronized();
    await args.opProcessingController.pauseProcessing(container);
    assert(dataStore.runtime.deltaManager.outbound.paused);

    await cb(container, dataStore, map);

    let pendingState: string;
    if (send) {
        pendingState = getPendingStateWithoutClose(container);
        await args.ensureSynchronized();
        container.close();
    } else {
        pendingState = container.closeAndGetPendingLocalState();
    }

    args.opProcessingController.resumeProcessing();

    assert.ok(pendingState);
    return pendingState;
};

async function loadOffline(provider: ITestObjectProvider, request: IRequest, pendingLocalState?: string):
    Promise<{ container: IContainer; connect: () => void; }> {
    const p = new Deferred();
    const documentServiceFactory = provider.driver.createDocumentServiceFactory();

    // patch document service methods to simulate offline by not resolving until we choose to
    const boundFn = documentServiceFactory.createDocumentService.bind(documentServiceFactory);
    documentServiceFactory.createDocumentService = async (...args) => {
        const docServ = await boundFn(...args);
        const boundCTDStream = docServ.connectToDeltaStream.bind(docServ);
        docServ.connectToDeltaStream = async (...args2) => {
            await p.promise;
            return boundCTDStream(...args2);
        };
        const boundCTDStorage = docServ.connectToDeltaStorage.bind(docServ);
        docServ.connectToDeltaStorage = async (...args2) => {
            await p.promise;
            return boundCTDStorage(...args2);
        };
        const boundCTStorage = docServ.connectToStorage.bind(docServ);
        docServ.connectToStorage = async (...args2) => {
            await p.promise;
            return boundCTStorage(...args2);
        };

        return docServ;
    };
    const loader = provider.createLoader(
        [[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
        { documentServiceFactory });
    const container = await loader.resolve(request, pendingLocalState ?? await getPendingOps(provider, false));
    return { container, connect: () => p.resolve(undefined) };
}

// Introduced in 0.37
// REVIEW: enable compat testing
describeNoCompat("stashed ops", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let url;
    let loader: IHostLoader;
    let container1: IContainer;
    let map1: SharedMap;
    let string1: SharedString;
    let cell1: SharedCell;
    let counter1: SharedCounter;
    let waitForSummary: () => Promise<void>;

    beforeEach(async () => {
        provider = getTestObjectProvider();
        loader = provider.makeTestLoader(testContainerConfig);
        container1 = await createAndAttachContainer(
            provider.defaultCodeDetails,
            loader,
            provider.driver.createCreateNewRequest(provider.documentId));
        provider.updateDocumentId(container1.resolvedUrl);
        url = await container1.getAbsoluteUrl("");
        const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        map1 = await dataStore1.getSharedObject<SharedMap>(mapId);
        cell1 = await dataStore1.getSharedObject<SharedCell>(cellId);
        counter1 = await dataStore1.getSharedObject<SharedCounter>(counterId);
        string1 = await dataStore1.getSharedObject<SharedString>(stringId);
        string1.insertText(0, "hello");

        waitForSummary = async () => {
            await new Promise<void>((resolve, reject) => {
                let summarized = false;
                container1.on("op", (op) => {
                    if (op.type === "summarize") {
                        summarized = true;
                    } else if (summarized && op.type === "summaryAck") {
                        resolve();
                    } else if (op.type === "summaryNack") {
                        reject(new Error("summaryNack"));
                    }
                });
            });
        };
    });

    it("resends op", async function() {
        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            map.set(testKey, testValue);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(map1.get(testKey), testValue);
        assert.strictEqual(map2.get(testKey), testValue);
    });

    it("resends cell op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, map) => {
            const cell = await d.getSharedObject<SharedCell>(cellId);
            cell.set(testValue);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const cell2 = await dataStore2.getSharedObject<SharedCell>(cellId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(cell1.get(), testValue);
        assert.strictEqual(cell2.get(), testValue);
    });

    it("resends counter op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, map) => {
            const counter = await d.getSharedObject<SharedCounter>(counterId);
            counter.increment(testIncrementValue);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(counter1.value, testIncrementValue);
        assert.strictEqual(counter2.value, testIncrementValue);
    });

    it("doesn't resend successful op", async function() {
        const pendingOps = await getPendingOps(provider, true, (c, d, map) => {
            map.set(testKey, "something unimportant");
        });

        map1.set(testKey, testValue);
        await provider.ensureSynchronized();

        // load with pending ops, which it should not resend because they were already sent successfully
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

        await provider.ensureSynchronized();
        assert.strictEqual(map1.get(testKey), testValue);
        assert.strictEqual(map2.get(testKey), testValue);
    });

    it("doesn't resend successful cell op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, map) => {
            const cell = await d.getSharedObject<SharedCell>(cellId);
            cell.set("something unimportant");
        });

        cell1.set(testValue);
        await provider.ensureSynchronized();

        // load with pending ops, which it should not resend because they were already sent successfully
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const cell2 = await dataStore2.getSharedObject<SharedCell>(cellId);

        await provider.ensureSynchronized();
        assert.strictEqual(cell1.get(), testValue);
        assert.strictEqual(cell2.get(), testValue);
    });

    it("doesn't resend successful counter op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, map) => {
            const counter = await d.getSharedObject<SharedCounter>(counterId);
            counter.increment(3);
        });

        counter1.increment(testIncrementValue);
        await provider.ensureSynchronized();

        // load with pending ops, which it should not resend because they were already sent successfully
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);

        await provider.ensureSynchronized();
        assert.strictEqual(counter1.value, testIncrementValue + 3);
        assert.strictEqual(counter2.value, testIncrementValue + 3);
    });

    it("resends delete op and can set after", async function() {
        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            map.delete("clear");
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(map1.has("clear"), false);
        assert.strictEqual(map2.has("clear"), false);
        map1.set("clear", "test1");
        await provider.ensureSynchronized();
        assert.strictEqual(map1.get("clear"), "test1");
        assert.strictEqual(map2.get("clear"), "test1");
    });

    it("resends a lot of ops", async function() {
        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        // load container with pending ops, which should resend the ops not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map1.get(i.toString()), i, `map 1 ${map1.get(i.toString())} !== ${i}`));
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map2.get(i.toString()), i, `map 2 ${map2.get(i.toString())} !== ${i}`));
    });

    it("doesn't resend a lot of successful ops", async function() {
        const pendingOps = await getPendingOps(provider, true, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        // send a bunch from first container that should not be overwritten
        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
        await provider.ensureSynchronized();

        // load container with pending ops, which should not resend the ops sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        [...Array(lots).keys()].map((i) => assert.strictEqual(map1.get(i.toString()), testValue));
        [...Array(lots).keys()].map((i) => assert.strictEqual(map2.get(i.toString()), testValue));
    });

    it("resends batched ops", async function() {
        const pendingOps = await getPendingOps(provider, false, (container, d, map) => {
            (container as any).context.runtime.orderSequentially(() => {
                [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
            });
        });

        // load container with pending ops, which should resend the ops not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map1.get(i.toString()), i, `map 1 ${map1.get(i.toString())} !== ${i}`));
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map2.get(i.toString()), i, `map 2 ${map2.get(i.toString())} !== ${i}`));
    });

    it("doesn't resend successful batched ops", async function() {
        const pendingOps = await getPendingOps(provider, true, (container, d, map) => {
            (container as any).context.runtime.orderSequentially(() => {
                [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
            });
        });

        // send a bunch from first container that should not be overwritten
        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));

        // load container with pending ops, which should not resend the ops sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await provider.ensureSynchronized();
        [...Array(lots).keys()].map((i) => assert.strictEqual(map1.get(i.toString()), testValue));
        [...Array(lots).keys()].map((i) => assert.strictEqual(map2.get(i.toString()), testValue));
    });

    it("resends chunked op", async function() {
        const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            map.set(testKey, bigString);
        });

        // load container with pending ops, which should resend the ops not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(map1.get(testKey), bigString, `map 1 ${map1.get(testKey)} !== ${bigString}`);
        assert.strictEqual(map2.get(testKey), bigString, `map 2 ${map2.get(testKey)} !== ${bigString}`);
    });

    it("doesn't resend successful chunked op", async function() {
        const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

        const pendingOps = await getPendingOps(provider, true, (c, d, map) => {
            map.set(testKey, bigString);
            map.set(testKey2, bigString);
        });

        // set on first container which should not be overwritten
        map1.set(testKey, testValue);
        map1.set(testKey2, testValue);

        // load container with pending ops, which should resend the ops not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await provider.ensureSynchronized();
        assert.strictEqual(map1.get(testKey), testValue);
        assert.strictEqual(map2.get(testKey), testValue);
        assert.strictEqual(map1.get(testKey2), testValue);
        assert.strictEqual(map2.get(testKey2), testValue);
    });

    it("pending map clear resend", async function() {
        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
        await provider.ensureSynchronized();

        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            map.clear();
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        [...Array(lots).keys()].map(async (i) => assert.strictEqual(map1.get(i.toString()), undefined));
        [...Array(lots).keys()].map(async (i) => assert.strictEqual(map2.get(i.toString()), undefined));
    });

    it("successful map clear no resend", async function() {
        const pendingOps = await getPendingOps(provider, true, (c, d, map) => {
            map.clear();
        });

        [...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
        await provider.ensureSynchronized();

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map1.get(i.toString()), testValue)));
        await Promise.all([...Array(lots).keys()].map(
            async (i) => assert.strictEqual(await map2.get(i.toString()), testValue)));
    });

    it("resends string insert op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.insertText(s.getLength(), " world!");
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(string1.getText(), "hello world!");
        assert.strictEqual(string2.getText(), "hello world!");
    });

    it("doesn't resend successful string insert op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.insertText(s.getLength(), " world!");
        });

        // load with pending ops, which it should not resend because they were already sent successfully
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        console.log(string2);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(string1.getText(), "hello world!");
        assert.strictEqual(string2.getText(), "hello world!");
    });

    it("resends string remove op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.removeText(0, s.getLength());
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(string1.getText(), "");
        assert.strictEqual(string2.getText(), "");
    });

    it("doesn't resend successful string remove op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.removeText(0, s.getLength());
        });

        string1.insertText(0, "goodbye cruel world");

        // load with pending ops, which it should not resend because they were already sent successfully
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(string1.getText(), "goodbye cruel world");
        assert.strictEqual(string2.getText(), "goodbye cruel world");
    });

    it("resends string annotate op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.annotateRange(0, s.getLength(), { bold: true });
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(string1.getPropertiesAtPosition(0)?.bold, true);
        assert.strictEqual(string2.getPropertiesAtPosition(0)?.bold, true);
    });

    it("doesn't resend successful string annotate op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.annotateRange(0, s.getLength(), { bold: true });
        });

        // change annotation, which should not be overwritten by successful stashed ops
        string1.annotateRange(0, string1.getLength(), { bold: false });

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(string1.getPropertiesAtPosition(0)?.bold, false);
        assert.strictEqual(string2.getPropertiesAtPosition(0)?.bold, false);
    });

    it("resends marker ops", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, map) => {
            const s = await d.getSharedObject<SharedString>(stringId);
            s.insertMarker(
                s.getLength(),
                ReferenceType.Simple,
                {
                    [reservedMarkerIdKey]: "markerId",
                    [reservedMarkerSimpleTypeKey]: "markerKeyValue",
                },
            );

            s.insertMarker(
                0,
                ReferenceType.Tile,
                {
                    [reservedTileLabelsKey]: ["tileLabel"],
                    [reservedMarkerIdKey]: "tileMarkerId",
                });
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();

        const simpleMarker1 = string1.getMarkerFromId("markerId");

        assert.strictEqual(simpleMarker1?.type, "Marker", "Could not get simple marker");
        assert.strictEqual(simpleMarker1?.properties?.markerId, "markerId", "markerId is incorrect");
        assert.strictEqual(simpleMarker1?.properties?.markerSimpleType, "markerKeyValue");
        const parallelMarkers1 = getTextAndMarkers(string1, "tileLabel");
        const parallelMarker1 = parallelMarkers1.parallelMarkers[0];
        assert.strictEqual(parallelMarker1.type, "Marker", "Could not get tile marker");
        assert.strictEqual(parallelMarker1.properties?.markerId, "tileMarkerId", "tile markerId is incorrect");

        const simpleMarker2 = string2.getMarkerFromId("markerId");
        assert.strictEqual(simpleMarker2?.type, "Marker", "Could not get simple marker");
        assert.strictEqual(simpleMarker2?.properties?.markerId, "markerId", "markerId is incorrect");
        assert.strictEqual(simpleMarker2?.properties?.markerSimpleType, "markerKeyValue");
        const parallelMarkers2 = getTextAndMarkers(string2, "tileLabel");
        const parallelMarker2 = parallelMarkers2.parallelMarkers[0];
        assert.strictEqual(parallelMarker2.type, "Marker", "Could not get tile marker");
        assert.strictEqual(parallelMarker2.properties?.markerId, "tileMarkerId", "tile markerId is incorrect");
    });

    it("resends attach op", async function() {
        const newMapId = "newMap";
        let id;
        const pendingOps = await getPendingOps(provider, false, async (container, d, m) => {
            const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
            const runtime = defaultDataStore.context.containerRuntime;

            const router = await runtime.createDataStore(["default"]);
            const dataStore: ITestFluidObject = await requestFluidObject<ITestFluidObject>(router, "/");
            id = dataStore.context.id;

            const channel = dataStore.runtime.createChannel(newMapId, "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            (await channel.handle.get() as SharedObject).bindToContext();
            defaultDataStore.root.set("someDataStore", dataStore.handle);
            (channel as SharedMap).set(testKey, testValue);
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        await ensureContainerConnected(container2);

        // get new datastore from first container
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container1, id);
        const map2 = await requestFluidObject<SharedMap>(dataStore2.runtime, newMapId);
        await provider.ensureSynchronized();
        assert.strictEqual(map2.get(testKey), testValue);
    });

    it("doesn't resend successful attach op", async function() {
        const newMapId = "newMap";
        const pendingOps = await getPendingOps(provider, true, async (container, d, m) => {
            const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
            const runtime = defaultDataStore.context.containerRuntime;

            const router = await runtime.createDataStore(["default"]);
            const dataStore = await requestFluidObject<ITestFluidObject>(router, "/");

            const channel = dataStore.runtime.createChannel(newMapId, "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            (await channel.handle.get() as SharedObject).bindToContext();
            defaultDataStore.root.set("someDataStore", dataStore.handle);
            (channel as SharedMap).set(testKey, testValue);
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        await ensureContainerConnected(container2);
    });

    it("cannot capture the pending local state during ordersequentially", async () => {
        const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        const map = await dataStore1.getSharedObject<SharedMap>(mapId);
        dataStore1.context.containerRuntime.orderSequentially(() => {
            map.set("key1", "value1");
            map.set("key2", "value2");
            assert.throws(() => {
                container1.closeAndGetPendingLocalState();
            }, "Should throw for incomplete batch");
            map.set("key3", "value3");
            map.set("key4", "value4");
        });
    });

    itExpects("waits for previous container's leave message", [
        { eventName: "fluid:telemetry:Container:connectedStateRejected" },
        { eventName: "fluid:telemetry:Container:WaitBeforeClientLeave_end" },
    ], async () => {
        const container = await provider.loadTestContainer(testContainerConfig);
        await ensureContainerConnected(container);
        const serializedClientId = container.clientId;
        assert.ok(serializedClientId);
        const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");

        await provider.ensureSynchronized();
        await provider.opProcessingController.pauseProcessing(container);
        assert(dataStore.runtime.deltaManager.outbound.paused);

        [...Array(lots).keys()].map((i) => dataStore.root.set(`test op #${i}`, i));

        const pendingState = getPendingStateWithoutClose(container);

        const container2 = await loader.resolve({ url }, pendingState);

        const connectP = new Promise<void>((resolve, reject) => {
            container2.on("connected", () => {
                if (container2.getQuorum().getMember(serializedClientId) === undefined) {
                    resolve();
                } else {
                    reject(new Error("connected while previous client in quorum"));
                }
            });
        });

        // wait for the join message so we see connectedStateRejected
        if (container2.connectionState !== ConnectionState.CatchingUp) {
            await new Promise((resolve) => container2.deltaManager.on("connect", resolve));
        }

        container.close();
        await connectP;
    });

    it("can make changes offline and resubmit them", async function() {
        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        const container2 = await loadOffline(provider, { url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2.container, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

        // pending changes should be applied
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map2.get(i.toString()), i, `map 2 ${map2.get(i.toString())} !== ${i}`));
        // make more changes while offline
        [...Array(lots).keys()].map((i) => map2.set((i + lots).toString(), i + lots));

        container2.connect();
        await ensureContainerConnected(container2.container);
        await provider.ensureSynchronized();
        [...Array(lots * 2).keys()].map((i) =>
            assert.strictEqual(map1.get(i.toString()), i, `map 1 ${map1.get(i.toString())} !== ${i}`));
        [...Array(lots * 2).keys()].map((i) =>
            assert.strictEqual(map2.get(i.toString()), i, `map 2 ${map2.get(i.toString())} !== ${i}`));
    });

    it("can make changes offline and stash them", async function() {
        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        const container2 = await loadOffline(provider, { url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2.container, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

        // pending changes should be applied
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map2.get(i.toString()), i, `map 2 ${map2.get(i.toString())} !== ${i}`));
        // make more changes while offline
        [...Array(lots).keys()].map((i) => map2.set((i + lots).toString(), i + lots));

        // get stashed ops from this container without connecting
        const morePendingOps = container2.container.closeAndGetPendingLocalState();

        const container3 = await loadOffline(provider, { url }, morePendingOps);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3.container, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);

        // pending changes from both containers should be applied
        [...Array(lots * 2).keys()].map((i) =>
            assert.strictEqual(map3.get(i.toString()), i, `map 3 ${map2.get(i.toString())} !== ${i}`));
        // make more changes while offline
        [...Array(lots).keys()].map((i) => map3.set((i + lots * 2).toString(), i + lots * 2));

        container3.connect();
        await ensureContainerConnected(container3.container);
        await provider.ensureSynchronized();
        [...Array(lots * 3).keys()].map((i) =>
            assert.strictEqual(map1.get(i.toString()), i, `map 1 ${map1.get(i.toString())} !== ${i}`));
        [...Array(lots * 3).keys()].map((i) =>
            assert.strictEqual(map3.get(i.toString()), i, `map 3 ${map3.get(i.toString())} !== ${i}`));
    });

    itExpects("waits for previous container's leave message after rehydration", [
        { eventName: "fluid:telemetry:Container:connectedStateRejected" },
        { eventName: "fluid:telemetry:Container:WaitBeforeClientLeave_end" },
    ], async () => {
        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            [...Array(lots).keys()].map((i) => map.set(i.toString(), i));
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        const serializedClientId = container2.clientId;
        assert.ok(serializedClientId);
        await provider.ensureSynchronized();
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map1.get(i.toString()), i, `map 1 ${map1.get(i.toString())} !== ${i}`));
        [...Array(lots).keys()].map((i) =>
            assert.strictEqual(map2.get(i.toString()), i, `map 2 ${map2.get(i.toString())} !== ${i}`));

        await provider.opProcessingController.pauseProcessing(container2);
        assert(dataStore2.runtime.deltaManager.outbound.paused);
        [...Array(lots).keys()].map((i) => map2.set((i + lots).toString(), i + lots));

        const morePendingOps = getPendingStateWithoutClose(container2);
        assert.ok(morePendingOps);

        const container3 = await loader.resolve({ url }, morePendingOps);

        const connectP = new Promise<void>((resolve, reject) => {
            container3.on("connected", () => {
                if (container3.getQuorum().getMember(serializedClientId) === undefined) {
                    resolve();
                } else {
                    reject(new Error("connected while previous client in quorum"));
                }
            });
        });

        // wait for the join message so we see connectedStateRejected
        if (container3.connectionState !== ConnectionState.CatchingUp) {
            await new Promise((resolve) => container3.deltaManager.on("connect", resolve));
        }

        container2.close();
        await connectP;
    });

    it("offline blob upload", async function() {
        const container = await loadOffline(provider, { url });
        const dataStore = await requestFluidObject<ITestFluidObject>(container.container, "default");
        const map = await dataStore.getSharedObject<SharedMap>(mapId);

        const handle = await dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
        assert.strictEqual(bufferToString(await handle.get(), "utf8"), "blob contents");
        map.set("blob handle", handle);

        container.connect();

        const container2 = await provider.loadTestContainer(testContainerConfig);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

        await provider.ensureSynchronized();
        assert.strictEqual(bufferToString(await map2.get("blob handle").get(), "utf8"), "blob contents");
    });

    it("stashed changes with blobs", async function() {
        const container = await loadOffline(provider, { url });
        const dataStore = await requestFluidObject<ITestFluidObject>(container.container, "default");
        const map = await dataStore.getSharedObject<SharedMap>(mapId);

        // Call uploadBlob() while offline to get local ID handle, and generate an op referencing it
        const handle = await dataStore.runtime.uploadBlob(stringToBuffer("blob contents 1", "utf8"));
        map.set("blob handle 1", handle);

        const stashedChanges = container.container.closeAndGetPendingLocalState();

        const container3 = await loadOffline(provider, { url }, stashedChanges);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3.container, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);

        // Blob is accessible locally while offline
        assert.strictEqual(bufferToString(await map3.get("blob handle 1").get(), "utf8"), "blob contents 1");

        container3.connect();
        await ensureContainerConnected(container3.container);
        await provider.ensureSynchronized();

        // Blob is uploaded and accessible by all clients
        assert.strictEqual(bufferToString(await map1.get("blob handle 1").get(), "utf8"), "blob contents 1");
        assert.strictEqual(bufferToString(await map3.get("blob handle 1").get(), "utf8"), "blob contents 1");
    });

    it("offline attach", async function() {
        const newMapId = "newMap";
        let id;
        // stash attach op
        const pendingOps = await getPendingOps(provider, false, async (container, d, m) => {
            const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
            const runtime = defaultDataStore.context.containerRuntime;

            const router = await runtime.createDataStore(["default"]);
            const dataStore = await requestFluidObject<ITestFluidObject>(router, "/");
            id = dataStore.context.id;

            const channel = dataStore.runtime.createChannel(newMapId, "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            (await channel.handle.get() as SharedObject).bindToContext();
            defaultDataStore.root.set("someDataStore", dataStore.handle);
            (channel as SharedMap).set(testKey, testValue);
        });

        // load offline; new datastore should be accessible
        const container2 = await loadOffline(provider, { url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2.container, id);
        const map2 = await requestFluidObject<SharedMap>(dataStore2.runtime, newMapId);
        assert.strictEqual(map2.get(testKey), testValue);
        map2.set(testKey2, testValue);

        container2.connect();
        await ensureContainerConnected(container2.container);

        // get new datastore from first container
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container1, id);
        const map3 = await requestFluidObject<SharedMap>(dataStore3.runtime, newMapId);
        await provider.ensureSynchronized();
        assert.strictEqual(map3.get(testKey), testValue);
        assert.strictEqual(map3.get(testKey2), testValue);
    });

    it("works for detached container", async function() {
        const loader2 = provider.makeTestLoader(testContainerConfig);
        const detachedContainer = await loader2.createDetachedContainer(provider.defaultCodeDetails);
        const dataStore = await requestFluidObject<ITestFluidObject>(detachedContainer, "default");
        const map = await dataStore.getSharedObject<SharedMap>(mapId);
        map.set(testKey, testValue);

        await detachedContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
        const pendingOps = detachedContainer.closeAndGetPendingLocalState();

        const url2 = await detachedContainer.getAbsoluteUrl("");
        assert.ok(url2);
        const container2 = await loader2.resolve({ url: url2 }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        assert.strictEqual(map2.get(testKey), testValue);
    });

    it("works for rehydrated container", async function() {
        const loader2 = provider.makeTestLoader(testContainerConfig);
        const detachedContainer = await loader2.createDetachedContainer(provider.defaultCodeDetails);
        const dataStore = await requestFluidObject<ITestFluidObject>(detachedContainer, "default");
        const map = await dataStore.getSharedObject<SharedMap>(mapId);
        map.set(testKey, testValue);

        const summary = detachedContainer.serialize();
        detachedContainer.close();
        const rehydratedContainer = await loader2.rehydrateDetachedContainerFromSnapshot(summary);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(rehydratedContainer, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        map2.set(testKey2, testValue);

        await rehydratedContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
        const pendingOps = rehydratedContainer.closeAndGetPendingLocalState();

        const url2 = await rehydratedContainer.getAbsoluteUrl("");
        assert.ok(url2);

        const container3 = await loader2.resolve({ url: url2 }, pendingOps);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
        assert.strictEqual(map3.get(testKey), testValue);
        assert.strictEqual(map3.get(testKey2), testValue);
    });

    // TODO: https://github.com/microsoft/FluidFramework/issues/10729
    it("works with summary while offline", async function() {
        map1.set("test op 1", "test op 1");
        await waitForSummary();

        const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
            map.set(testKey, testValue);
        });

        map1.set("test op 2", "test op 2");
        await waitForSummary();

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(map1.get(testKey), testValue);
        assert.strictEqual(map2.get(testKey), testValue);
    });

    // TODO: https://github.com/microsoft/FluidFramework/issues/10729
    it("can stash between summary op and ack", async function() {
        map1.set("test op 1", "test op 1");
        const container = await provider.loadTestContainer(testContainerConfig);
        const pendingOps = await new Promise<string>((resolve, reject) => container.on("op", (op) => {
            if (op.type === "summarize") {
                resolve(container.closeAndGetPendingLocalState());
            }
        }));

        const container2 = await loader.resolve({ url }, pendingOps);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
    });
});
