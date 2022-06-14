/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IStream } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { NoOpDocumentDeltaStorageService } from "../noOpDocumentDeltaStorageService";

describe("NoOp IDocumentDeltaStorageService", () => {
    async function readAll(stream: IStream<ISequencedDocumentMessage[]>) {
        const ops: ISequencedDocumentMessage[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const result = await stream.read();
            if (result.done) { break; }
            ops.push(...result.value);
        }
        return ops;
    }

    function assertProperReturnValue(actual: ISequencedDocumentMessage[]) {
        assert.strictEqual(actual.length, 1, "There should be a single message");
        assert.strictEqual(actual[0].type, MessageType.NoOp, "Message should be of type NoOp");
        assert.strictEqual(actual[0].contents, undefined, "Contents should be undefined");
    }

    it("Fetches NoOp every call", async () => {
        for (let i = 0; i < 3; i++) {
            assertProperReturnValue(await readAll(new NoOpDocumentDeltaStorageService().fetchMessages(1, 2)));
        }
    });

    it("Fetches new ClientID every call", async () => {
        assert.notStrictEqual(
            (await readAll(new NoOpDocumentDeltaStorageService().fetchMessages(1, 2)))[0].clientId,
            (await readAll(new NoOpDocumentDeltaStorageService().fetchMessages(1, 2)))[0].clientId,
        );
    });
});
