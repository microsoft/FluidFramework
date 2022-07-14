/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IStream } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { EmptyDocumentDeltaStorageService } from "../emptyDocumentDeltaStorageService";

describe("Empty IDocumentDeltaStorageService", () => {
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

    it("Fetches empty queue every call", async () => {
        for (let i = 0; i < 3; i++) {
            const messages = await readAll(new EmptyDocumentDeltaStorageService().fetchMessages(1, 2));
            assert.strictEqual(messages.length, 0, "There should be no messages");
        }
    });
});
