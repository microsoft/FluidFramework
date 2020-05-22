/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedSummaryBlock } from "@fluidframework/shared-summary-block";
import { IComponentLastEditedTracker, ILastEditDetails } from "./interfaces";

/**
 * Tracks the last edit details such as the last edited user details and the last edited timestamp. The last edited
 * details should be updated (via updateLastEditDetails) in response to a remote op since it uses shared summary block
 * as storage.
 */
export class LastEditedTracker implements IComponentLastEditedTracker {
    private readonly lastEditedDetailsKey = "lastEditDetailsKey";

    /**
     * Creates a LastEditedTracker object.
     * @param sharedSummaryBlock - The shared summary block where the details will be stored.
     */
    constructor(private readonly sharedSummaryBlock: SharedSummaryBlock) {}

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
    public updateLastEditDetails(lastEditDetails: ILastEditDetails) {
        this.sharedSummaryBlock.set(this.lastEditedDetailsKey, lastEditDetails);
    }
}
