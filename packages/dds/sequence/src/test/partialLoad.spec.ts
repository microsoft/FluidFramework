/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ReferenceType } from "@fluidframework/merge-tree";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import { ITree } from "@fluidframework/protocol-definitions";
import { SharedStringFactory, SharedString } from "..";

function applyOperations(sharedString: SharedString, content = sharedString.getLength().toString()) {
    const lenMod = sharedString.getLength() % 4;
    switch (lenMod) {
        case 0:
            sharedString.insertText(0, content);
            break;

        case 1: {
            const pos = Math.floor(sharedString.getLength() / lenMod);
            sharedString.insertMarker(pos, ReferenceType.Simple);
            break;
        }

        case 2: {
            sharedString.insertText(sharedString.getLength(), content);
            const pos = Math.floor(sharedString.getLength() / lenMod);
            sharedString.removeText(
                pos,
                pos + 1);
            // fall through to insert after remove
        }
        default:
            sharedString.insertText(sharedString.getLength(), content);
    }
}

const mergeTreeSnapshotChunkSize = 5;

function generateSnapshotTree(
    containerRuntimeFactory: MockContainerRuntimeFactory,
    options: any = {},
): [SharedString, ITree] {
    const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
    dataStoreRuntime1.options = options;
    // Connect the first SharedString.
    const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
    const services1: IChannelServices = {
        deltaConnection: containerRuntime1.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };
    const sharedString = new SharedString(dataStoreRuntime1, "shared-string", SharedStringFactory.Attributes);
    sharedString.initializeLocal();
    sharedString.connect(services1);

    // Create and connect a second SharedString.
    const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
    dataStoreRuntime2.options = options;
    const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
    const sharedString2 = new SharedString(dataStoreRuntime2, "shared-string", SharedStringFactory.Attributes);
    const services2: IChannelServices = {
        deltaConnection: containerRuntime2.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };
    sharedString2.initializeLocal();
    sharedString2.connect(services2);

    while (sharedString.getLength() < mergeTreeSnapshotChunkSize * 3) {
        applyOperations(sharedString);
        containerRuntimeFactory.processAllMessages();
    }
    assert.equal(sharedString2.getText(), sharedString.getText());
    const snapshotTree = sharedString2.snapshot();
    assert(snapshotTree);
    return [sharedString2, snapshotTree];
}

describe("SharedString Partial Load", () => {
    it("Validate Full Load", async () => {
        const containerRuntimeFactory = new MockContainerRuntimeFactory();
        const options = { mergeTreeSnapshotChunkSize };
        const [remoteSharedString, snapshotTree] = generateSnapshotTree(containerRuntimeFactory, options);

        const localDataStoreRuntime = new MockFluidDataStoreRuntime();
        localDataStoreRuntime.options = options;
        const localContainerRuntime = containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
        const localServices = {
            deltaConnection: localContainerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(snapshotTree),
        };
        const localSharedString =
            new SharedString(localDataStoreRuntime, "shared-string", SharedStringFactory.Attributes);

        // eslint-disable-next-line no-null/no-null
        await localSharedString.load(null, localServices);

        assert.equal(localSharedString.getText(), remoteSharedString.getText());
    });

    it("Validate New Format Load", async () => {
        const containerRuntimeFactory = new MockContainerRuntimeFactory();
        const options = { newMergeTreeSnapshotFormat: true, mergeTreeSnapshotChunkSize };
        const [remoteSharedString, snapshotTree] = generateSnapshotTree(containerRuntimeFactory, options);

        const localDataStoreRuntime = new MockFluidDataStoreRuntime();
        localDataStoreRuntime.options = options;
        const localContainerRuntime = containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
        const localServices = {
            deltaConnection: localContainerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(snapshotTree),
        };
        const localSharedString =
            new SharedString(localDataStoreRuntime, "shared-string", SharedStringFactory.Attributes);

        // eslint-disable-next-line no-null/no-null
        await localSharedString.load(null, localServices);

        assert.equal(localSharedString.getText(), remoteSharedString.getText());
    });

    it("Validate Partial load", async () => {
        const containerRuntimeFactory = new MockContainerRuntimeFactory();
        const options = {
            newMergeTreeSnapshotFormat: true,
            sequenceInitializeFromHeaderOnly: true,
            mergeTreeSnapshotChunkSize,
        };
        const [remoteSharedString, snapshotTree] = generateSnapshotTree(containerRuntimeFactory, options);

        const localDataStoreRuntime = new MockFluidDataStoreRuntime();
        localDataStoreRuntime.options = options;
        const localContainerRuntime = containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
        const localServices = {
            deltaConnection: localContainerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(snapshotTree),
        };
        const localSharedString =
            new SharedString(localDataStoreRuntime, "shared-string", SharedStringFactory.Attributes);

        // eslint-disable-next-line no-null/no-null
        await localSharedString.load(null, localServices);

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        await localSharedString.loaded;
        localDataStoreRuntime.deltaManager.lastSequenceNumber = localSharedString.getCurrentSeq();

        assert.equal(localSharedString.getText(), remoteSharedString.getText());
    });

    it("Validate Partial load with local ops", async () => {
        const containerRuntimeFactory = new MockContainerRuntimeFactory();
        const options =
        {
            sequenceInitializeFromHeaderOnly: true,
            mergeTreeSnapshotChunkSize,
        };
        const [remoteSharedString, snapshotTree] = generateSnapshotTree(containerRuntimeFactory, options);

        const localDataStoreRuntime = new MockFluidDataStoreRuntime();
        localDataStoreRuntime.options = options;
        const localContainerRuntime = containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
        const localServices = {
            deltaConnection: localContainerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(snapshotTree),
        };
        const localSharedString =
            new SharedString(localDataStoreRuntime, "shared-string", SharedStringFactory.Attributes);

        // eslint-disable-next-line no-null/no-null
        await localSharedString.load(null, localServices);

        localDataStoreRuntime.deltaManager.lastSequenceNumber =
            containerRuntimeFactory.sequenceNumber;

        localDataStoreRuntime.deltaManager.minimumSequenceNumber =
            containerRuntimeFactory.getMinSeq();

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        for (let i = 0; i < 10; i++) {
            applyOperations(localSharedString, "L");
        }

        assert.equal(containerRuntimeFactory.outstandingMessageCount, 0);

        await localSharedString.loaded;

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());
        assert.notEqual(containerRuntimeFactory.outstandingMessageCount, 0);
        containerRuntimeFactory.processAllMessages();

        assert.equal(localSharedString.getText(), remoteSharedString.getText());
    });

    it("Validate Partial load with remote ops", async () => {
        const containerRuntimeFactory = new MockContainerRuntimeFactory();
        const options =
        {
            sequenceInitializeFromHeaderOnly: true,
            mergeTreeSnapshotChunkSize,
        };
        const [remoteSharedString, snapshotTree] = generateSnapshotTree(containerRuntimeFactory, options);

        const localDataStoreRuntime = new MockFluidDataStoreRuntime();
        localDataStoreRuntime.options = options;
        const localContainerRuntime = containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
        const localServices = {
            deltaConnection: localContainerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(snapshotTree),
        };
        const localSharedString =
            new SharedString(localDataStoreRuntime, "shared-string", SharedStringFactory.Attributes);

        // eslint-disable-next-line no-null/no-null
        await localSharedString.load(null, localServices);

        localDataStoreRuntime.deltaManager.lastSequenceNumber =
            containerRuntimeFactory.sequenceNumber;

        localDataStoreRuntime.deltaManager.minimumSequenceNumber =
            containerRuntimeFactory.getMinSeq();

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        for (let i = 0; i < 10; i++) {
            applyOperations(remoteSharedString, "R");
        }
        containerRuntimeFactory.processAllMessages();

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        await localSharedString.loaded;

        assert.equal(localSharedString.getText(), remoteSharedString.getText());
    });

    it("Validate Partial load with local and remote ops", async () => {
        const containerRuntimeFactory = new MockContainerRuntimeFactory();
        const options =
        {
            sequenceInitializeFromHeaderOnly: true,
            mergeTreeSnapshotChunkSize,
        };
        const [remoteSharedString, snapshotTree] = generateSnapshotTree(containerRuntimeFactory, options);

        const localDataStoreRuntime = new MockFluidDataStoreRuntime();
        localDataStoreRuntime.options = options;
        const localContainerRuntime = containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
        const localServices = {
            deltaConnection: localContainerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(snapshotTree),
        };
        const localSharedString =
            new SharedString(localDataStoreRuntime, "shared-string", SharedStringFactory.Attributes);

        // eslint-disable-next-line no-null/no-null
        await localSharedString.load(null, localServices);

        localDataStoreRuntime.deltaManager.lastSequenceNumber =
            containerRuntimeFactory.sequenceNumber;

        localDataStoreRuntime.deltaManager.minimumSequenceNumber =
            containerRuntimeFactory.getMinSeq();

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        for (let i = 0; i < 10; i++) {
            applyOperations(remoteSharedString, "R");
        }
        for (let i = 0; i < 10; i++) {
            applyOperations(localSharedString, "L");
        }
        containerRuntimeFactory.processAllMessages();
        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        await localSharedString.loaded;

        assert.notEqual(localSharedString.getText(), remoteSharedString.getText());

        containerRuntimeFactory.processAllMessages();

        assert.equal(localSharedString.getText(), remoteSharedString.getText());
    });
});
