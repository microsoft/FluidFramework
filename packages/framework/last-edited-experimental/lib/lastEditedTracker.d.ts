/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block";
import { IFluidLastEditedTracker, ILastEditDetails } from "./interfaces";
/**
 * Tracks the last edit details such as the last edited user details and the last edited timestamp. The last edited
 * details should be updated (via updateLastEditDetails) in response to a remote op since it uses shared summary block
 * as storage.
 */
export declare class LastEditedTracker implements IFluidLastEditedTracker {
    private readonly sharedSummaryBlock;
    private readonly lastEditedDetailsKey;
    /**
     * Creates a LastEditedTracker object.
     * @param sharedSummaryBlock - The shared summary block where the details will be stored.
     */
    constructor(sharedSummaryBlock: SharedSummaryBlock);
    get IFluidLastEditedTracker(): this;
    /**
     * {@inheritDoc (IFluidLastEditedTracker:interface).getLastEditDetails}
     */
    getLastEditDetails(): ILastEditDetails | undefined;
    /**
     * {@inheritDoc (IFluidLastEditedTracker:interface).updateLastEditDetails}
     */
    updateLastEditDetails(lastEditDetails: ILastEditDetails): void;
}
//# sourceMappingURL=lastEditedTracker.d.ts.map