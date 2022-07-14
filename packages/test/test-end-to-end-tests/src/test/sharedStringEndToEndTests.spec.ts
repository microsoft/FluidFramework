/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
    ChannelFactoryRegistry,
    ITestFluidObject,
} from "@fluidframework/test-utils";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { Marker, ReferenceType, reservedMarkerIdKey } from "@fluidframework/merge-tree";

const stringId = "sharedStringKey";
const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

describeFullCompat("SharedString", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    let sharedString1: SharedString;
    let sharedString2: SharedString;
    let dataObject1: ITestFluidObject;

    beforeEach(async () => {
        const container1 = await provider.makeTestContainer(testContainerConfig) as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

        const container2 = await provider.loadTestContainer(testContainerConfig) as Container;
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
    });

    it("can sync SharedString across multiple containers", async () => {
        const text = "syncSharedString";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await provider.ensureSynchronized();

        assert.equal(sharedString2.getText(), text, "The inserted text should have synced across the containers");
    });

    it("can sync SharedString to a newly loaded container", async () => {
        const text = "syncToNewContainer";
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

        // Wait for the ops to to be submitted and processed across the containers.
        await provider.ensureSynchronized();

        // Create a initialize a new container with the same id.
        const newContainer = await provider.loadTestContainer(testContainerConfig) as Container;
        const newComponent = await requestFluidObject<ITestFluidObject>(newContainer, "default");
        const newSharedString = await newComponent.getSharedObject<SharedString>(stringId);
        assert.equal(
            newSharedString.getText(), text, "The new container should receive the inserted text on creation");
    });

    it("marker passes on attachment directly and transitively to any referenced DDS", async () => {
        sharedString1.insertText(0, "hello world");
        // Insert a simple marker.
        sharedString1.insertMarker(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
            },
        );

        // When an unattached DDS refers to another unattached DDS, both remain unattached
        const detachedString = SharedString.create(dataObject1.runtime, "detachedString");
        detachedString.insertText(0, "blue");
        const detachedMap: ISharedMap = SharedMap.create(dataObject1.runtime);
        detachedMap.set("key", detachedString.handle);

        assert.equal(detachedString.isAttached(), false, "detachedString should not be attached");
        assert.equal(detachedMap.isAttached(), false, "detachedMap should not be attached");
        assert.equal(sharedString1.isAttached(), true, "sharedString1 should be attached");

        // When referring cell becomes attached, the referred cell becomes attached
        // and the attachment transitively passes to a second referred DDS
        const simpleMarker = sharedString1.getMarkerFromId("markerId") as Marker;
        const prop = { color: detachedMap.handle };
        sharedString1.annotateMarker(simpleMarker, prop);

        assert.equal(detachedString.isAttached(), true, "detachedString should be attached");
        assert.equal(detachedMap.isAttached(), true, "detachedMap should be attached");
        assert.equal(sharedString1.isAttached(), true, "sharedString1 should be attached");
    });
});
