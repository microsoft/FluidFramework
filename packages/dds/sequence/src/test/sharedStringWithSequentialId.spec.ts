/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReferenceType, Marker, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime, MockStorage } from "@fluidframework/test-runtime-utils";
import { assert } from "@fluidframework/common-utils";
import { SharedString } from "../sharedString";
import { sharedStringWithSequentialIdMixin } from "../sharedStringWithSequentialId";
import { isValidSeqId } from "../generateSequentialId";
import { SharedStringFactory } from "../sequenceFactory";

describe("SharedStringWithSequential Id", () => {
    let sharedStringWithSequentialId: SharedString;
    let dataStoreRuntime: MockFluidDataStoreRuntime;
    let containerRuntimeFactory: MockContainerRuntimeFactory;

    beforeEach(() => {
        containerRuntimeFactory = new MockContainerRuntimeFactory();
        dataStoreRuntime = new MockFluidDataStoreRuntime();
        const sharedStringWithSequentialIdFactory = sharedStringWithSequentialIdMixin();
        // eslint-disable-next-line max-len
        sharedStringWithSequentialId = new sharedStringWithSequentialIdFactory(dataStoreRuntime, "string-seq-1", SharedStringFactory.Attributes);
                    // Connect the first SharedString.
                    dataStoreRuntime.local = false;
                    const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
                    const services1 = {
                        deltaConnection: containerRuntime1.createDeltaConnection(),
                        objectStorage: new MockStorage(),
                    };
                    sharedStringWithSequentialId.initializeLocal();
                    sharedStringWithSequentialId.connect(services1);
                });

    it("should have a marker id after marker insertion", async ()=> {
        sharedStringWithSequentialId.insertMarker(0, ReferenceType.Tile);
        const segment = sharedStringWithSequentialId.getContainingSegment(0).segment;
        // Process the message.
        containerRuntimeFactory.processAllMessages();

        assert(Marker.is(segment), "Make sure we found our marker");
        const id = segment.getId();
        assert(id !== undefined && id.length > 0, "Id should be defined and have a valid length");
        assert(isValidSeqId(id), "Id is a valid sequential id");
        const segmentJson = segment.toJSONObject();
        assert(segmentJson.props !== undefined && segmentJson.props[reservedMarkerIdKey] === id);
    });
});
