/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { decompress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert, IsoBuffer } from "@fluidframework/common-utils";

/**
 * State machine that "unrolls" contents of compressed batches of ops after decompressing them
 */
export class OpDecompressor {
    private activeBatch = false;
    private rootMessage: ISequencedDocumentMessage | undefined;
    private processedCount = 0;

    constructor() {

    }

    public processMessage(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
        // Beginning of a compressed batch
        if (message.metadata?.batch === true && message.metadata?.compressed) {
            assert(this.activeBatch === false, "shouldn't have multiple active batches");

            this.activeBatch = true;
            this.rootMessage = message;

            const contents = IsoBuffer.from(this.rootMessage.contents.packedContents, "base64");
            const decompressedMessage = decompress(contents);
            const intoString = new TextDecoder().decode(decompressedMessage);
            const asObj = JSON.parse(intoString);
            this.rootMessage.contents = asObj;

            return { ...message, contents: JSON.parse(this.rootMessage.contents[this.processedCount++]) };
        } else if (this.rootMessage !== undefined && message.metadata === undefined && this.activeBatch) {
            // Continuation of compressed batch
            return { ...message, contents: JSON.parse(this.rootMessage.contents[this.processedCount++]) };
        } else if (this.rootMessage !== undefined && message.metadata?.batch === false) {
            // End of compressed batch
            const returnMessage = { ...message,
                                    contents: JSON.parse(this.rootMessage.contents[this.processedCount++]) };

            this.activeBatch = false;
            this.rootMessage = undefined;
            this.processedCount = 0;

            return returnMessage;
        } else if (message.metadata?.batch === undefined && message.metadata?.compressed) {
            assert(this.activeBatch === false, "shouldn't receive compressed message in middle of a batch");

            // Single compressed message
            const contents = IsoBuffer.from(message.contents.packedContents, "base64");
            const decompressedMessage = decompress(contents);
            const intoString = new TextDecoder().decode(decompressedMessage);
            const asObj = JSON.parse(intoString);

            return { ...message, contents: JSON.parse(asObj) };
        }

        return message;
    }
}
