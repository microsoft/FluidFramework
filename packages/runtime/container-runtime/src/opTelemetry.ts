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
    private _systemOpCount: number = 0;
    public get systemOpCount(): number {
        return this._systemOpCount;
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
            this._systemOpCount += isSystemMessage(message) ? 1 : 0;
            const stringContents = typeof message.contents === "string" ?
                message.contents :
                JSON.stringify(message.contents);
            this._opsSizeAccumulator += utf8ByteLength(stringContents);
        });
    }

    public reset() {
        this._systemOpCount = 0;
        this._opsSizeAccumulator = 0;
    }
}
