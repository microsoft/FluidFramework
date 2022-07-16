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
        // Insert a simple marker.
        sharedString1.insertMarker(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
            },
        );
        const detachedString1 = SharedString.create(dataObject1.runtime, "detachedString1");
        detachedString1.insertMarker(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
            },
        );
        const detachedString2 = SharedString.create(dataObject1.runtime, "detachedString2");

        // When an unattached DDS refers to another unattached DDS, both remain unattached
        const simpleMarker = detachedString1.getMarkerFromId("markerId") as Marker;
        const prop = { color: detachedString2.handle };
        detachedString1.annotateMarker(simpleMarker, prop);

        assert.equal(detachedString1.isAttached(), false, "detachedString1 should not be attached");
        assert.equal(detachedString2.isAttached(), false, "detachedString2 should not be attached");
        assert.equal(sharedString1.isAttached(), true, "sharedString1 should be attached");

        // When referring SharedString becomes attached, the referred SharedString becomes attached
        // and the attachment transitively passes to a second referred SharedString
        const simpleMarker2 = sharedString1.getMarkerFromId("markerId") as Marker;
        const prop2 = { color: detachedString1.handle };
        sharedString1.annotateMarker(simpleMarker2, prop2);

        assert.equal(detachedString1.isAttached(), true, "detachedString1 should be attached");
        assert.equal(detachedString2.isAttached(), true, "detachedString2 should be attached");
        assert.equal(sharedString1.isAttached(), true, "sharedString1 should be attached");
    });
});
