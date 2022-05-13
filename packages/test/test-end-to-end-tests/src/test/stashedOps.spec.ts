/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import {
    ReferenceType,
    reservedMarkerIdKey,
    reservedMarkerSimpleTypeKey,
    reservedTileLabelsKey,
} from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
    ChannelFactoryRegistry,
    createAndAttachContainer,
    DataObjectFactoryType,
    ITestContainerConfig,
    ITestFluidObject,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { SharedMatrix } from "@fluidframework/matrix";

const mapId = "map";
const stringId = "sharedStringKey";
const matrixId = "sharedMatrixKey";
const registry: ChannelFactoryRegistry = [
    [mapId, SharedMap.getFactory()],
    [stringId, SharedString.getFactory()],
    [matrixId, SharedMatrix.getFactory()],
];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
    runtimeOptions: {
        summaryOptions: {
            // currently these tests will break if we load from a summary that was too recent
            disableSummaries: true,
        },
    },
};

const lots = 30;
const testKey = "test key";
const testKey2 = "another test key";
const testValue = "test value";

const ensureContainerConnected = async (container: IContainer) => {
    if (!container.connected) {
        return new Promise<void>((resolve) => container.once("connected", () => resolve()));
    }
};

type MapCallback = (container: IContainer, dataStore: ITestFluidObject, map: SharedMap) => void | Promise<void>;

// load container, pause, create (local) ops from callback, then optionally send ops before closing container
const getPendingOps = async (args: ITestObjectProvider, send: boolean, cb: MapCallback) => {
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
        const pendingRuntimeState = (container as any).context.runtime.getPendingLocalState();
        await args.ensureSynchronized();
        const p = container.closeAndGetPendingLocalState();
        assert.strictEqual(JSON.parse(p).pendingRuntimeState, undefined);
        // if we sent the ops successfully the pending state should have a clientId. if not they will be resent anyway
        assert(pendingRuntimeState.clientId !== undefined, "no clientId for successful ops");
        assert(container.resolvedUrl !== undefined && container.resolvedUrl.type === "fluid");
        pendingState = JSON.stringify({
            url: container.resolvedUrl.url,
            pendingRuntimeState,
        });
    } else {
        pendingState = container.closeAndGetPendingLocalState();
    }

    args.opProcessingController.resumeProcessing();

    assert.ok(pendingState);
    return pendingState;
};

// Introduced in 0.37
// REVIEW: enable compat testing
describeNoCompat("stashed ops", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let url;
    let loader: IHostLoader;
    let container1: IContainer;
    let map1: SharedMap;
    let string1: SharedString;
    let matrix1: SharedMatrix;

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
        string1 = await dataStore1.getSharedObject<SharedString>(stringId);
        string1.insertText(0, "hello");
        matrix1 = await dataStore1.getSharedObject<SharedMatrix>(matrixId);
        matrix1.insertRows(0, 20);
        matrix1.insertCols(0, 20);
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
        assert.strictEqual(simpleMarker1.type, "Marker", "Could not get simple marker");
        assert.strictEqual(simpleMarker1.properties?.markerId, "markerId", "markerId is incorrect");
        assert.strictEqual(simpleMarker1.properties?.markerSimpleType, "markerKeyValue");
        const parallelMarkers1 = string1.getTextAndMarkers("tileLabel");
        const parallelMarker1 = parallelMarkers1.parallelMarkers[0];
        assert.strictEqual(parallelMarker1.type, "Marker", "Could not get tile marker");
        assert.strictEqual(parallelMarker1.properties?.markerId, "tileMarkerId", "tile markerId is incorrect");

        const simpleMarker2 = string2.getMarkerFromId("markerId");
        assert.strictEqual(simpleMarker2.type, "Marker", "Could not get simple marker");
        assert.strictEqual(simpleMarker2.properties?.markerId, "markerId", "markerId is incorrect");
        assert.strictEqual(simpleMarker2.properties?.markerSimpleType, "markerKeyValue");
        const parallelMarkers2 = string2.getTextAndMarkers("tileLabel");
        const parallelMarker2 = parallelMarkers2.parallelMarkers[0];
        assert.strictEqual(parallelMarker2.type, "Marker", "Could not get tile marker");
        assert.strictEqual(parallelMarker2.properties?.markerId, "tileMarkerId", "tile markerId is incorrect");
    });

    it("resends matrix set op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, m) => {
            const matrix = await d.getSharedObject<SharedMatrix>(matrixId);
            matrix.setCell(0, 0, testValue);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const matrix2 = await dataStore2.getSharedObject<SharedMatrix>(matrixId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(matrix1.getCell(0, 0), testValue);
        assert.strictEqual(matrix2.getCell(0, 0), testValue);
    });

    it("doesn't resend successful matrix set op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, m) => {
            const matrix = await d.getSharedObject<SharedMatrix>(matrixId);
            matrix.setCell(0, 0, testValue);
        });

        matrix1.setCell(0, 0, "a different value");

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const matrix2 = await dataStore2.getSharedObject<SharedMatrix>(matrixId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(matrix1.getCell(0, 0), "a different value");
        assert.strictEqual(matrix2.getCell(0, 0), "a different value");
    });

    it("resends matrix insert col op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, m) => {
            const matrix = await d.getSharedObject<SharedMatrix>(matrixId);
            matrix.insertCols(matrix.colCount, 1);
            matrix.insertRows(matrix.rowCount, 1);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const matrix2 = await dataStore2.getSharedObject<SharedMatrix>(matrixId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(matrix1.colCount, 21);
        assert.strictEqual(matrix2.colCount, 21);
        assert.strictEqual(matrix1.rowCount, 21);
        assert.strictEqual(matrix2.rowCount, 21);
    });

    it("doesn't resend successful matrix insert col op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, m) => {
            const matrix = await d.getSharedObject<SharedMatrix>(matrixId);
            matrix.insertCols(matrix.colCount, 1);
            matrix.insertRows(matrix.rowCount, 1);
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const matrix2 = await dataStore2.getSharedObject<SharedMatrix>(matrixId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(matrix1.colCount, 21);
        assert.strictEqual(matrix2.colCount, 21);
        assert.strictEqual(matrix1.rowCount, 21);
        assert.strictEqual(matrix2.rowCount, 21);
    });

    it("resends matrix remove col op", async function() {
        const pendingOps = await getPendingOps(provider, false, async (c, d, m) => {
            const matrix = await d.getSharedObject<SharedMatrix>(matrixId);
            matrix.removeCols(0, 1);
            matrix.removeRows(0, 1);
        });

        // load container with pending ops, which should resend the op not sent by previous container
        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const matrix2 = await dataStore2.getSharedObject<SharedMatrix>(matrixId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(matrix1.colCount, 19);
        assert.strictEqual(matrix2.colCount, 19);
        assert.strictEqual(matrix1.rowCount, 19);
        assert.strictEqual(matrix2.rowCount, 19);
    });

    it("doesn't resend successful matrix remove col op", async function() {
        const pendingOps = await getPendingOps(provider, true, async (c, d, m) => {
            const matrix = await d.getSharedObject<SharedMatrix>(matrixId);
            matrix.removeCols(0, 1);
            matrix.removeRows(0, 1);
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        const matrix2 = await dataStore2.getSharedObject<SharedMatrix>(matrixId);
        await ensureContainerConnected(container2);
        await provider.ensureSynchronized();
        assert.strictEqual(matrix1.colCount, 19);
        assert.strictEqual(matrix2.colCount, 19);
        assert.strictEqual(matrix1.rowCount, 19);
        assert.strictEqual(matrix2.rowCount, 19);
    });

    it("resends attach op", async function() {
        const newMapId = "newMap";
        let id;
        const pendingOps = await getPendingOps(provider, false, async (container, d, m) => {
            const runtime = (container as any).context.runtime as IContainerRuntime;

            const router = await runtime.createDataStore(["default"]);
            const dataStore = await requestFluidObject<ITestFluidObject>(router, "/");
            id = dataStore.context.id;

            const channel = dataStore.runtime.createChannel(newMapId, "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            (await channel.handle.get() as SharedObject).bindToContext();
            dataStore.channel.bindToContext();
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
            const runtime = (container as any).context.runtime as IContainerRuntime;

            const router = await runtime.createDataStore(["default"]);
            const dataStore = await requestFluidObject<ITestFluidObject>(router, "/");

            const channel = dataStore.runtime.createChannel(newMapId, "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            (await channel.handle.get() as SharedObject).bindToContext();
            dataStore.channel.bindToContext();
            (channel as SharedMap).set(testKey, testValue);
        });

        const container2 = await loader.resolve({ url }, pendingOps);
        await ensureContainerConnected(container2);
    });
});
