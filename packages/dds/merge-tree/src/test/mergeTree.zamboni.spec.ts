/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { IMergeBlock } from "../mergeTreeNodes";
import { Zamboni } from "../zamboni";
import { TestClient } from "./testClient";

describe("Zamboni Logic", () => {
    let client: TestClient;
    let zamboni: Zamboni;
    const localUserLongId = "localUser";
    beforeEach(() => {
        client = new TestClient();
        zamboni = new Zamboni();
        for (const c of "hello world") {
            client.insertTextLocal(client.getLength(), c);
        }
        client.startOrUpdateCollaboration(localUserLongId);

    });
    it("packParent with no children segments", () => {
        // currently the applyMsg calls are copied from the other test I wrote that
        // that calls zamboni and packParent indirectly --> not entirely right, but
        // it does run how I want it to
        client.applyMsg(client.makeOpMessage(client.removeRangeLocal(0, client.getLength()-1), 1));
        zamboni.packParent(client.mergeTree.root, client.mergeTree);
        assert.equal(client.mergeTree.root.cachedLength, 1);

        client.applyMsg(
            client.makeOpMessage(
                client.removeRangeLocal(0, client.getLength()),
                client.getCurrentSeq(),
                client.getCurrentSeq(),
                undefined,
                client.getCurrentSeq()));
        assert.equal(client.mergeTree.root.cachedLength, 0);
        // does run with no children segments, but I think it gets called prior to this
        // in the call stack of the applyMsg call
        zamboni.packParent(client.mergeTree.root, client.mergeTree);

        assert.equal(client.mergeTree.root.childCount, 0);

    });
    it("zamboni with no segments to scour", () => {
        const cachedLength = client.mergeTree.root.cachedLength;
        const childCount = client.mergeTree.root.childCount;

        zamboni.zamboniSegments(client.mergeTree);

        assert.equal(cachedLength, client.mergeTree.root.cachedLength);
        assert.equal(childCount, client.mergeTree.root.childCount);
    });
    it("zamboni with one segment to scour", () =>{
        const initialChildCount = (client.mergeTree.root.children[0] as IMergeBlock).childCount;
        const initialCachedLength = client.mergeTree.root.cachedLength;
        client.removeRangeLocal(0, 1);
        zamboni.zamboniSegments(client.mergeTree);

        assert.equal(client.mergeTree.root.cachedLength, initialCachedLength-1);
        assert.equal((client.mergeTree.root.children[0] as IMergeBlock).childCount, initialChildCount);

    });
    it("zamboni with many segments to scour", () => {
        client.removeRangeLocal(0, 6);

        assert.equal(client.mergeTree.root.children[0].cachedLength, 0);

        zamboni.zamboniSegments(client.mergeTree);
        zamboni.packParent(client.mergeTree.root, client.mergeTree);

        assert.equal(client.mergeTree.root.childCount, 1);
    });
});
