// tslint:disable:no-object-literal-type-assertion
import { ISequencedDocumentMessage } from "@prague/container-definitions";
import * as MergeTree from "./client";
import { MergeTreeDeltaType } from "./ops";
import { insertTextLocal, insertTextRemote, specToSegment } from "./test/testUtils";

/**
 * Example of overlapping insertion position.  Clients A and B both insert at position 0.
 */
function overlappingInsert(bSeesTheCat = false) {
    if (bSeesTheCat) {
        console.log("B sees the cat!");
    }
    let sequenceNumber = 1;
    const properties = undefined;
    // create merge tree with content 'on the mat.'
    const clientA = new MergeTree.Client("on the mat.", specToSegment);
    // have client print out all operations
    clientA.verboseOps = true;
    // establish min sequence number of 0 and assign client id
    clientA.startCollaboration("A");
    // create merge tree with content 'on the mat.'
    const clientB = new MergeTree.Client("on the mat.", specToSegment);
    // establish min sequence number of 0 and assign client id
    clientB.startCollaboration("B");
    clientB.verboseOps = true;
    // A does local insert of 'cat ' at position zero (unassigned sequence number)
    insertTextLocal(clientA, "cat ", 0);
    // see the merge tree for A
    console.log(clientA.mergeTree.toString());
    // B does a local insert of 'big' at position zero (unassigned sequence number)
    insertTextLocal(clientB, "big ", 0);
    // see the merge tree for B
    console.log(clientB.mergeTree.toString());
    if (!bSeesTheCat) {
        // B does a local insert of 'one ' at position four (unassigned sequence number)
        insertTextLocal(clientB, "furry ", 4);
        // see the merge tree for B
        console.log(clientB.mergeTree.toString());
    }
    // simulate server choosing A's insert of 'cat ' as sequence number 1
    // ack client A's op
    clientA.ackPendingSegment({
        local: true,
        op: { type: MergeTreeDeltaType.INSERT },
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    });
    console.log(clientA.mergeTree.toString());
    // propagate client A's op to client B
    const referenceSequenceNumber = 0;
    const bLocalIdForA = clientB.getOrAddShortClientId("A", null);
    /* tslint:disable:no-unsafe-any */
    insertTextRemote(clientB, "cat ", 0, properties, sequenceNumber,
        referenceSequenceNumber, bLocalIdForA);
    console.log(clientB.mergeTree.toString());
    // tslint:disable-next-line:no-increment-decrement
    sequenceNumber++;
    // simulate server choosing B's two insert operations as sequence numbers 2 and 3
    clientB.ackPendingSegment({
        local: true,
        op: { type: MergeTreeDeltaType.INSERT },
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    });
    console.log(clientB.mergeTree.toString());
    const aLocalIdForB = clientA.getOrAddShortClientId("B", null);
    insertTextRemote(clientA, "big ", 0, properties, sequenceNumber,
        referenceSequenceNumber, aLocalIdForB);
    console.log(clientA.mergeTree.toString());

    // tslint:disable-next-line:no-increment-decrement
    sequenceNumber++;
    if (bSeesTheCat) {
        insertTextLocal(clientB, "furry ", 8);
        console.log(clientB.mergeTree.toString());
    }
    clientB.ackPendingSegment({
        local: true,
        op: { type: MergeTreeDeltaType.INSERT },
        sequencedMessage: {
            sequenceNumber,
        } as ISequencedDocumentMessage,
    });
    console.log(clientB.mergeTree.toString());
    if (bSeesTheCat) {
        insertTextRemote(clientA, "furry ", 8 /* insert after cat */, properties, sequenceNumber,
            2 /* ref seq sees cat*/, aLocalIdForB);
        console.log(clientA.mergeTree.toString());
    } else {
        insertTextRemote(clientA, "furry ", 4, properties, sequenceNumber,
            referenceSequenceNumber, aLocalIdForB);
        console.log(clientA.mergeTree.toString());
    }
}

overlappingInsert();
overlappingInsert(true);
