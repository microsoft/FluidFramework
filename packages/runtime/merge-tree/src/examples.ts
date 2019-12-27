/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { MergeTreeDeltaType } from "./ops";
// eslint-disable-next-line import/no-internal-modules
import { TestClient } from "./test/testClient";

/**
 * Example of overlapping insertion position.  Clients A and B both insert at position 0.
 */
function overlappingInsert(bSeesTheCat = false) {
    if (bSeesTheCat) {
        console.log("B sees the cat!");
    }
    let sequenceNumber = 1;
    const properties = undefined;
    // Create merge tree with content 'on the mat.'
    const clientA = new TestClient();
    clientA.insertTextLocal(0, "on the mat.");
    // Have client print out all operations
    clientA.verboseOps = true;
    // Establish min sequence number of 0 and assign client id
    clientA.startCollaboration("A");
    // Create merge tree with content 'on the mat.'
    const clientB = new TestClient();
    clientB.insertTextLocal(0, "on the mat.");
    // Establish min sequence number of 0 and assign client id
    clientB.startCollaboration("B");
    clientB.verboseOps = true;
    // A does local insert of 'cat ' at position zero (unassigned sequence number)
    clientA.insertTextLocal(0, "cat ");
    // See the merge tree for A
    console.log(clientA.mergeTree.toString());
    // B does a local insert of 'big' at position zero (unassigned sequence number)
    clientB.insertTextLocal(0, "big ");
    // See the merge tree for B
    console.log(clientB.mergeTree.toString());
    if (!bSeesTheCat) {
        // B does a local insert of 'one ' at position four (unassigned sequence number)
        clientB.insertTextLocal(4, "furry ");
        // See the merge tree for B
        console.log(clientB.mergeTree.toString());
    }
    // Simulate server choosing A's insert of 'cat ' as sequence number 1
    // ack client A's op
    clientA.mergeTree.ackPendingSegment({
        op: { type: MergeTreeDeltaType.INSERT },
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    });
    console.log(clientA.mergeTree.toString());
    // Propagate client A's op to client B
    const referenceSequenceNumber = 0;
    clientB.insertTextRemote(0, "cat ", properties, sequenceNumber,
        referenceSequenceNumber, "A");
    console.log(clientB.mergeTree.toString());
    sequenceNumber++;
    // Simulate server choosing B's two insert operations as sequence numbers 2 and 3
    clientB.mergeTree.ackPendingSegment({
        op: { type: MergeTreeDeltaType.INSERT },
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    });
    console.log(clientB.mergeTree.toString());
    clientA.insertTextRemote(0, "big ", properties, sequenceNumber,
        referenceSequenceNumber, "B");
    console.log(clientA.mergeTree.toString());

    sequenceNumber++;
    if (bSeesTheCat) {
        clientB.insertTextLocal(8, "furry ");
        console.log(clientB.mergeTree.toString());
    }
    clientB.mergeTree.ackPendingSegment({
        op: { type: MergeTreeDeltaType.INSERT },
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    });
    console.log(clientB.mergeTree.toString());
    if (bSeesTheCat) {
        clientA.insertTextRemote(8 /* insert after cat */, "furry ", properties, sequenceNumber,
            2 /* ref seq sees cat*/, "B");
        console.log(clientA.mergeTree.toString());
    } else {
        clientA.insertTextRemote(4, "furry ", properties, sequenceNumber,
            referenceSequenceNumber, "B");
        console.log(clientA.mergeTree.toString());
    }
}

overlappingInsert();
overlappingInsert(true);
