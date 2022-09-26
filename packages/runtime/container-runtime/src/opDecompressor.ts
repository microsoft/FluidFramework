/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { decompress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert, IsoBuffer } from "@fluidframework/common-utils";
// import { assert } from "@fluidframework/common-utils";

export class OpDecompressor {
    private activeBatch = false;
    private rootMessage: ISequencedDocumentMessage | undefined;
    private processedCount = 0;

    constructor() {

    }

    public processMessage(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return { ...message, contents: JSON.parse(this.rootMessage.contents[this.processedCount++]) };
        } else if (this.rootMessage !== undefined && message.metadata?.batch === false) {
            // End of batch

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, max-len
            const returnMessage = { ...message, contents: JSON.parse(this.rootMessage.contents[this.processedCount++]) };

            this.activeBatch = false;
            this.rootMessage = undefined;
            this.processedCount = 0;

            return returnMessage;
        }

        return message;
    }
}
