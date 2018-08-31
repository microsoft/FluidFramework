import * as MergeTree from "./mergeTree";

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
    const clientA = new MergeTree.Client("on the mat.");
    // have client print out all operations
    clientA.verboseOps = true;
    // establish min sequence number of 0 and assign client id
    clientA.startCollaboration("A");
    // create merge tree with content 'on the mat.'
    const clientB = new MergeTree.Client("on the mat.");
    // establish min sequence number of 0 and assign client id
    clientB.startCollaboration("B");
    clientB.verboseOps = true;
    // A does local insert of 'cat ' at position zero (unassigned sequence number)
    clientA.insertTextLocal("cat ", 0);
    // see the merge tree for A
    console.log(clientA.mergeTree.toString());
    // B does a local insert of 'big' at position zero (unassigned sequence number)
    clientB.insertTextLocal("big ", 0);
    // see the merge tree for B
    console.log(clientB.mergeTree.toString());
    if (!bSeesTheCat) {
        // B does a local insert of 'one ' at position four (unassigned sequence number)
        clientB.insertTextLocal("furry ", 4);
        // see the merge tree for B
        console.log(clientB.mergeTree.toString());
    }
    // simulate server choosing A's insert of 'cat ' as sequence number 1
    // ack client A's op
    clientA.ackPendingSegment(sequenceNumber);
    console.log(clientA.mergeTree.toString());
    // propagate client A's op to client B
    const referenceSequenceNumber = 0;
    const bLocalIdForA = clientB.getOrAddShortClientId("A", null);
    clientB.insertTextRemote("cat ", 0, properties, sequenceNumber,
        referenceSequenceNumber, bLocalIdForA);
    console.log(clientB.mergeTree.toString());
    sequenceNumber++;
    // simulate server choosing B's two insert operations as sequence numbers 2 and 3
    clientB.ackPendingSegment(sequenceNumber);
    console.log(clientB.mergeTree.toString());
    const aLocalIdForB = clientA.getOrAddShortClientId("B", null);
    clientA.insertTextRemote("big ", 0, properties, sequenceNumber,
        referenceSequenceNumber, aLocalIdForB);
    console.log(clientA.mergeTree.toString());

    sequenceNumber++;
    if (bSeesTheCat) {
        clientB.insertTextLocal("furry ", 8);
        console.log(clientB.mergeTree.toString());
    }
    clientB.ackPendingSegment(sequenceNumber);
    console.log(clientB.mergeTree.toString());
    if (bSeesTheCat) {
        clientA.insertTextRemote("furry ", 8 /* insert after cat */, properties, sequenceNumber,
            2 /* ref seq sees cat*/, aLocalIdForB);
        console.log(clientA.mergeTree.toString());
    } else {
        clientA.insertTextRemote("furry ", 4, properties, sequenceNumber,
            referenceSequenceNumber, aLocalIdForB);
        console.log(clientA.mergeTree.toString());
    }
}

overlappingInsert();
overlappingInsert(true);
