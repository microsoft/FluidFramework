/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { isSystemMessage } from "@fluidframework/protocol-base";
import { utf8ByteLength } from "@fluidframework/runtime-utils";

export class OpTracker {
    private _nonSystemOpCount: number = 0;
    public get nonSystemOpCount(): number {
        return this._nonSystemOpCount;
    }

    private _opsSizeAccumulator: number = 0;
    public get opsSizeAccumulator(): number {
        return this._opsSizeAccumulator;
    }

    public constructor(
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        disabled: boolean,
    ) {
        if (disabled) {
            return;
        }

        deltaManager.on("op", (message) => {
            this._nonSystemOpCount += isSystemMessage(message) ? 0 : 1;
            const stringContents = typeof message.contents === "string" ?
                message.contents :
                JSON.stringify(message.contents);
            this._opsSizeAccumulator += utf8ByteLength(stringContents);
        });
    }

    public reset() {
        this._nonSystemOpCount = 0;
        this._opsSizeAccumulator = 0;
    }
}
