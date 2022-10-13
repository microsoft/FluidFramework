/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { decompress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert, IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { CompressionAlgorithms } from ".";

/**
 * State machine that "unrolls" contents of compressed batches of ops after decompressing them.
 * This class relies on some implicit contracts defined below:
 * 1. A compressed batch will have its first message with batch metadata set to true and compressed set to true
 * 2. Messages in the middle of a compressed batch will have neither batch metadata nor the compression property set
 * 3. The final message of a batch will have batch metadata set to false
 * 4. An individually compressed op will have undefined batch metadata and compression set to true
 */
export class OpDecompressor {
    private activeBatch = false;
    private rootMessageContents: any | undefined;
    private processedCount = 0;

    constructor() {

    }

    public processMessage(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
        // Beginning of a compressed batch
        // We're checking for compression = true or top level compression property so
        // that we can enable compression without waiting on all ordering services
        // to pick up protocol change. Eventually only the top level property should
        // be used.
        if (message.metadata?.batch === true
            && (message.metadata?.compressed || (message as any).compression !== undefined)) {
            assert(this.activeBatch === false, "shouldn't have multiple active batches");
            if ((message as any).compression) {
                // lz4 is the only supported compression algorithm for now
                assert((message as any).compression === CompressionAlgorithms.lz4,
                        "lz4 is currently the only supported compression algorithm");
            }

            this.activeBatch = true;

            const contents = IsoBuffer.from(message.contents.packedContents, "base64");
            const decompressedMessage = decompress(contents);
            const intoString = Uint8ArrayToString(decompressedMessage);
            const asObj = JSON.parse(intoString);
            this.rootMessageContents = asObj;

            return { ...message, contents: this.rootMessageContents[this.processedCount++] };
        } else if (this.rootMessageContents !== undefined && message.metadata === undefined && this.activeBatch) {
            // Continuation of compressed batch
            return { ...message, contents: this.rootMessageContents[this.processedCount++] };
        } else if (this.rootMessageContents !== undefined && message.metadata?.batch === false) {
            // End of compressed batch
            const returnMessage = { ...message,
                                    contents: this.rootMessageContents[this.processedCount++] };

            this.activeBatch = false;
            this.rootMessageContents = undefined;
            this.processedCount = 0;

            return returnMessage;
        } else if (message.metadata?.batch === undefined &&
            (message.metadata?.compressed || (message as any).compression === CompressionAlgorithms.lz4)) {
            assert(this.activeBatch === false, "shouldn't receive compressed message in middle of a batch");

            // Single compressed message
            const contents = IsoBuffer.from(message.contents.packedContents, "base64");
            const decompressedMessage = decompress(contents);
            const intoString = new TextDecoder().decode(decompressedMessage);
            const asObj = JSON.parse(intoString);

            return { ...message, contents: asObj[0] };
        }

        return message;
    }
}
