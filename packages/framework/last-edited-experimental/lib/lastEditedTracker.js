/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Tracks the last edit details such as the last edited user details and the last edited timestamp. The last edited
 * details should be updated (via updateLastEditDetails) in response to a remote op since it uses shared summary block
 * as storage.
 */
export class LastEditedTracker {
    /**
     * Creates a LastEditedTracker object.
     * @param sharedSummaryBlock - The shared summary block where the details will be stored.
     */
    constructor(sharedSummaryBlock) {
        this.sharedSummaryBlock = sharedSummaryBlock;
        this.lastEditedDetailsKey = "lastEditDetailsKey";
    }
    get IFluidLastEditedTracker() {
        return this;
    }
    /**
     * {@inheritDoc (IFluidLastEditedTracker:interface).getLastEditDetails}
     */
    getLastEditDetails() {
        return this.sharedSummaryBlock.get(this.lastEditedDetailsKey);
    }
    /**
     * {@inheritDoc (IFluidLastEditedTracker:interface).updateLastEditDetails}
     */
    updateLastEditDetails(lastEditDetails) {
        this.sharedSummaryBlock.set(this.lastEditedDetailsKey, lastEditDetails);
    }
}
//# sourceMappingURL=lastEditedTracker.js.map