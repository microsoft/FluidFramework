/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { LocalKafka } from "../localKafka";
import { LocalContext } from "../localContext";
import { IQueuedMessage } from "@fluidframework/server-services-core";

describe("LocalKafka", () => {

    function createMessage(sequenceNumber: number) {
        return {
            sequenceNumber,
        }
    }

    it("works with one subscription", async () => {
        const localKafka = new LocalKafka();

        let sequenceNumber = 0;
        localKafka.subscribe({
            context: new LocalContext(undefined),
            process: (message: IQueuedMessage) => {
                const parsed = JSON.parse(message.value);
                assert.strictEqual(parsed.sequenceNumber, sequenceNumber + 1);
                sequenceNumber++;
                return undefined;
            }
        });

        localKafka.send([createMessage(1), createMessage(2)], "topic");
        assert.strictEqual(sequenceNumber, 2);

        localKafka.send([createMessage(3)], "topic");
        assert.strictEqual(sequenceNumber, 3);

        localKafka.send([createMessage(4)], "topic");
        assert.strictEqual(sequenceNumber, 4);

        assert.strictEqual(localKafka.length, 0);

        localKafka.close();
    });

    it("works with two subscriptions", async () => {
        const localKafka = new LocalKafka();

        let sequenceNumber1 = 0;
        localKafka.subscribe({
            context: new LocalContext(undefined),
            process: (message: IQueuedMessage) => {
                const parsed = JSON.parse(message.value);
                assert.strictEqual(parsed.sequenceNumber, sequenceNumber1 + 1);
                sequenceNumber1++;
                return undefined;
            }
        });

        let sequenceNumber2 = 0;
        localKafka.subscribe({
            context: new LocalContext(undefined),
            process: (message: IQueuedMessage) => {
                const parsed = JSON.parse(message.value);
                assert.strictEqual(parsed.sequenceNumber, sequenceNumber2 + 1);
                sequenceNumber2++;
                return undefined;
            }
        });

        localKafka.send([createMessage(1), createMessage(2)], "topic");
        assert.strictEqual(sequenceNumber1, 2);
        assert.strictEqual(sequenceNumber2, 2);

        localKafka.send([createMessage(3)], "topic");
        assert.strictEqual(sequenceNumber1, 3);
        assert.strictEqual(sequenceNumber2, 3);

        localKafka.send([createMessage(4)], "topic");
        assert.strictEqual(sequenceNumber1, 4);
        assert.strictEqual(sequenceNumber2, 4);

        assert.strictEqual(localKafka.length, 0);

        localKafka.close();
    });

    it("close clears queue", async () => {
        const localKafka = new LocalKafka();

        localKafka.send([createMessage(1), createMessage(2)], "topic");
        assert.strictEqual(localKafka.length, 2);

        localKafka.send([createMessage(3)], "topic");
        assert.strictEqual(localKafka.length, 3);

        localKafka.send([createMessage(4)], "topic");
        assert.strictEqual(localKafka.length, 4);

        localKafka.close();

        assert.strictEqual(localKafka.length, 0);
    });
});
