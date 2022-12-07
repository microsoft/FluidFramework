/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { decompress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert, IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { CompressionAlgorithms } from "../containerRuntime";

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

    /**
     * Processes remote messages and decompresses them as needed, per the
     * internal state of the decompression state machine. Messages without
     * compression will be ignored.
     *
     * If the message is decompressed, the method will change its original content with
     * the decompressed content.
     *
     * @param message - The message to process
     * @returns true if the message has been decompressed (and mutated), false otherwise
     */
    public processMessage(message: ISequencedDocumentMessage): boolean {
        // We're checking for compression = true or top level compression property so
        // that we can enable compression without waiting on all ordering services
        // to pick up protocol change. Eventually only the top level property should
        // be used.
        if (message.metadata?.batch === true
            && (message.metadata?.compressed || message.compression !== undefined)) {
            // Beginning of a compressed batch
            assert(this.activeBatch === false, "shouldn't have multiple active batches");
            if (message.compression) {
                // lz4 is the only supported compression algorithm for now
                assert(message.compression === CompressionAlgorithms.lz4,
                    "lz4 is currently the only supported compression algorithm");
            }

            this.activeBatch = true;

            const contents = IsoBuffer.from(message.contents.packedContents, "base64");
            const decompressedMessage = decompress(contents);
            const intoString = Uint8ArrayToString(decompressedMessage);
            const asObj = JSON.parse(intoString);
            this.rootMessageContents = asObj;
            message.contents = this.rootMessageContents[this.processedCount++];
            return true;
        }

        if (this.rootMessageContents !== undefined && message.metadata?.batch === undefined && this.activeBatch) {
            // Continuation of compressed batch
            message.contents = this.rootMessageContents[this.processedCount++];
            return true;
        }

        if (this.rootMessageContents !== undefined && message.metadata?.batch === false) {
            // End of compressed batch
            message.contents = this.rootMessageContents[this.processedCount++];

            this.activeBatch = false;
            this.rootMessageContents = undefined;
            this.processedCount = 0;

            return true;
        }

        if (message.metadata?.batch === undefined &&
            (message.metadata?.compressed || message.compression === CompressionAlgorithms.lz4)) {
            // Single compressed message
            assert(this.activeBatch === false, "shouldn't receive compressed message in middle of a batch");

            const contents = IsoBuffer.from(message.contents.packedContents, "base64");
            const decompressedMessage = decompress(contents);
            const intoString = new TextDecoder().decode(decompressedMessage);
            message.contents = JSON.parse(intoString)[0];
            return true;
        }

        return false;
    }
}
