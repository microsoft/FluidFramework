/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";

describe("client.getPosition", () => {
    const localUserLongId = "localUser";
    let client: TestClient;
    let segment: TextSegment;
    const segPos = 4;
    beforeEach(() => {
        client = new TestClient();
        for (const c of "hello world") {
            client.insertTextLocal(client.getLength(), c);
        }
        client.startOrUpdateCollaboration(localUserLongId);

        const segOff = client.getContainingSegment(segPos);
        assert(TextSegment.is(segOff.segment!));
        assert.strictEqual(segOff.offset, 0);
        assert.strictEqual(segOff.segment.text, "o");
        segment = segOff.segment;
    });

    it("Existing Segment", () => {
        const pos = client.getPosition(segment);
        assert.strictEqual(pos, segPos);
    });

    it("Deleted Segment", () => {
        client.removeRangeLocal(segPos, segPos + 1);
        assert.notStrictEqual(segment.removedSeq, undefined);
        const pos = client.getPosition(segment);
        assert.strictEqual(pos, segPos);
    });

    it("Detached Segment", () => {
        client.applyMsg(client.makeOpMessage(client.removeRangeLocal(segPos, segPos + 1), 1));
        // do some work and move the client's min seq forward, so zamboni runs
        for (const c of "hello world") {
            client.applyMsg(
                client.makeOpMessage(
                    client.insertTextLocal(client.getLength(), c),
                    client.getCurrentSeq() + 1,
                    client.getCurrentSeq(),
                    undefined,
                    client.getCurrentSeq()));
        }
        assert.notStrictEqual(segment.removedSeq, undefined);

        const pos = client.getPosition(segment);
        assert.strictEqual(pos, -1);
    });

    it("Moved Segment", () => {
        client.removeRangeLocal(segPos - 1, segPos);
        const pos = client.getPosition(segment);
        assert.strictEqual(pos, segPos - 1);
    });
});
