/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ReferenceType, Marker, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
    MockStorage } from "@fluidframework/test-runtime-utils";
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
                    sharedStringWithSequentialId.connect(services1);    });

    function validateMarker(marker: Marker): void {
        const id = marker.getId();
        assert(id !== undefined && id.length > 0, "Id should be defined and have a valid length");
        assert(isValidSeqId(id), "Id is a valid sequential id");

        // Validate summary
        const segmentJson = marker.toJSONObject();
        assert(segmentJson.props !== undefined && segmentJson.props[reservedMarkerIdKey] === id);
    }

    // it("should have a marker id after marker insertion", async ()=> {
    //     sharedStringWithSequentialId.insertMarker(0, ReferenceType.Tile);
    //     const segment = sharedStringWithSequentialId.getContainingSegment(0).segment;
    //     // Process the message.
    //     containerRuntimeFactory.processAllMessages();

    //     assert(Marker.is(segment), "Make sure we found our marker");
    //     validateMarker(segment);
    // });

    // it("should have a marker id after marker insertion after existing marker", async ()=> {
    //     sharedStringWithSequentialId.insertMarker(0, ReferenceType.Tile);
    //     sharedStringWithSequentialId.insertMarker(1, ReferenceType.Tile);

    //     // Process all messages.
    //     containerRuntimeFactory.processAllMessages();

    //     const segmentAt0 = sharedStringWithSequentialId.getContainingSegment(0).segment;
    //     const segmentAt1 = sharedStringWithSequentialId.getContainingSegment(1).segment;

    //     assert(Marker.is(segmentAt0) && Marker.is(segmentAt1), "Make sure we found markers");
    //     validateMarker(segmentAt0);
    //     validateMarker(segmentAt1);
    //     const id0 = segmentAt0.getId();
    //     const id1 = segmentAt1.getId();
    //     assert(id0 < id1, "Id at 0 should be smaller than id at 1");
    // });

    it("should have a marker id after marker insertion before existing marker", async ()=> {
        sharedStringWithSequentialId.insertMarker(0, ReferenceType.Tile, { insert1: true });
        sharedStringWithSequentialId.insertMarker(0, ReferenceType.Tile, { insert2: true });

        // Process all messages.
        containerRuntimeFactory.processAllMessages();

        const segmentAt0 = sharedStringWithSequentialId.getContainingSegment(0).segment;
        const segmentAt1 = sharedStringWithSequentialId.getContainingSegment(1).segment;

        assert(Marker.is(segmentAt0) && Marker.is(segmentAt1), "Make sure we found markers");
        validateMarker(segmentAt0);
        validateMarker(segmentAt1);
        const id0 = segmentAt0.getId();
        const id1 = segmentAt1.getId();
        assert(id0 < id1, "Id at 0 should be smaller than id at 1");
    });

    it("should have a marker id after marker insertion between two markers", async ()=> {
        sharedStringWithSequentialId.insertMarker(0, ReferenceType.Tile);
        sharedStringWithSequentialId.insertMarker(1, ReferenceType.Tile);
        sharedStringWithSequentialId.insertMarker(1, ReferenceType.Tile);
        containerRuntimeFactory.processAllMessages();

        const segmentAt0 = sharedStringWithSequentialId.getContainingSegment(0).segment;
        const segmentAt1 = sharedStringWithSequentialId.getContainingSegment(1).segment;
        const segmentAt2 = sharedStringWithSequentialId.getContainingSegment(2).segment;

        assert(Marker.is(segmentAt0) && Marker.is(segmentAt1) && Marker.is(segmentAt2), "Make sure we found markers");
        validateMarker(segmentAt0);
        validateMarker(segmentAt1);
        validateMarker(segmentAt2);

        const id0 = segmentAt0.getId();
        const id1 = segmentAt1.getId();
        const id2 = segmentAt2.getId();
        assert(id0 < id1, "Id at 0 should be smaller than id at 1");
        assert(id1 < id2, "Id at 1 should be smaller than id at 2");
    });
});
