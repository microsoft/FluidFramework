/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISequencedDocumentMessage, IUser, IQuorum } from "@microsoft/fluid-protocol-definitions";
import { Jsonable } from "@microsoft/fluid-runtime-definitions";
import { SummarizableObject } from "@microsoft/fluid-summarizable-object";
import { ILastEditedTracker, ILastEditDetails } from "./interfaces";

/**
 * Tracks the last edit details such as the last edited user id and the last edited timestamp. The details
 * should be updated (via updateLastEditDetails) in response to a remote op since it uses summarizable object
 * as storage.
 * It emits a "lastEditedChanged" event when the detail is updated.
 */
export class LastEditedTracker extends EventEmitter implements ILastEditedTracker {
    private readonly lastEditedDetailsKey = "lastEditDetailsKey";

    /**
     * Creates a LastEditedTracker object.
     * @param summarizableObject - The summarizable object where the details will be stored.
     * @param quorum - Quorum to get the user information from an incoming op.
     */
    constructor(
        private readonly summarizableObject: SummarizableObject,
        private readonly quorum: IQuorum) {
        super();
    }

    public on(event: "lastEditedChanged", listener: (lastEditDetails: ILastEditDetails) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * {@inheritDoc ILastEditedTracker.getLastEditDetails}
     */
    public getLastEditDetails(): ILastEditDetails | undefined {
        return this.summarizableObject.get<ILastEditDetails>(this.lastEditedDetailsKey);
    }

    /**
     * {@inheritDoc ILastEditedTracker.updateLastEditDetails}
     */
    public updateLastEditDetails(message: ISequencedDocumentMessage) {
        // Get the user information from the client information in the quorum and set the
        // summarizable object.
        const client = this.quorum.getMember(message.clientId);
        const user = client?.client.user as IUser;
        if (user !== undefined) {
            const lastEditDetails: ILastEditDetails = {
                userId: user.id,
                timestamp: message.timestamp,
            };
            this.summarizableObject.set(this.lastEditedDetailsKey, lastEditDetails as unknown as Jsonable);
            this.emit("lastEditedChanged", lastEditDetails);
        }
    }
}
