/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { Jsonable } from "@microsoft/fluid-runtime-definitions";
import { SharedSummaryBlock } from "@microsoft/fluid-shared-summary-block";
import { IComponentLastEditedTracker, ILastEditDetails } from "./interfaces";

/**
 * Tracks the last edit details such as the last edited client's id and the last edited timestamp. The details
 * should be updated (via updateLastEditDetails) in response to a remote op since it uses shared summary block
 * as storage.
 * It emits a "lastEditedChanged" event when the detail is updated.
 */
export class LastEditedTracker extends EventEmitter implements IComponentLastEditedTracker {
    private readonly lastEditedDetailsKey = "lastEditDetailsKey";

    /**
     * Creates a LastEditedTracker object.
     * @param sharedSummaryBlock - The shared summary block where the details will be stored.
     */
    constructor(
        private readonly sharedSummaryBlock: SharedSummaryBlock) {
        super();
    }

    public on(event: "lastEditedChanged", listener: (lastEditDetails: ILastEditDetails) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public get IComponentLastEditedTracker() {
        return this;
    }

    /**
     * {@inheritDoc ILastEditedTracker.getLastEditDetails}
     */
    public getLastEditDetails(): ILastEditDetails | undefined {
        return this.sharedSummaryBlock.get<ILastEditDetails>(this.lastEditedDetailsKey);
    }

    /**
     * {@inheritDoc ILastEditedTracker.updateLastEditDetails}
     */
    public updateLastEditDetails(message: ISequencedDocumentMessage) {
        // Set the clientId and timestamp from the message in the shared summary block.
        const lastEditDetails: ILastEditDetails = {
            clientId: message.clientId,
            timestamp: message.timestamp,
        };
        this.sharedSummaryBlock.set(this.lastEditedDetailsKey, lastEditDetails as unknown as Jsonable);
        this.emit("lastEditedChanged", lastEditDetails);
    }
}
