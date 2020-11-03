/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/common-utils";
import { IProvideFluidLastEditedTracker, ILastEditDetails } from "./interfaces";

/**
 * LastEditedTrackerDataObject keeps track of the latest edits to the document.
 */
export class LastEditedTrackerDataObject extends DataObject
    implements IProvideFluidLastEditedTracker {
    private static readonly factory = new DataObjectFactory(
        "@fluidframework/last-edited-experimental",
        LastEditedTrackerDataObject,
        [SharedSummaryBlock.getFactory()],
        {},
        undefined,
    );

    public static getFactory() {
        return LastEditedTrackerDataObject.factory;
    }

    private readonly sharedSummaryBlockId = "shared-summary-block-id";

    private readonly lastEditedDetailsKey = "lastEditDetailsKey";

    private _sharedSummaryBlock?: SharedSummaryBlock;

    public get IFluidLastEditedTracker() {
        return this;
    }

    private get sharedSummaryBlock(): SharedSummaryBlock {
        assert(this._sharedSummaryBlock !== undefined, "not initialized");
        return this._sharedSummaryBlock;
    }

    /**
     * {@inheritDoc (IFluidLastEditedTracker:interface).getLastEditDetails}
     */
    public getLastEditDetails(): ILastEditDetails | undefined {
        return this.sharedSummaryBlock.get<ILastEditDetails>(this.lastEditedDetailsKey);
    }

    /**
     * {@inheritDoc (IFluidLastEditedTracker:interface).updateLastEditDetails}
     */
    public updateLastEditDetails(lastEditDetails: ILastEditDetails) {
        this.sharedSummaryBlock.set(this.lastEditedDetailsKey, lastEditDetails);
    }

    protected async initializingFirstTime() {
        const sharedSummaryBlock = SharedSummaryBlock.create(this.runtime);
        this.root.set(this.sharedSummaryBlockId, sharedSummaryBlock.handle);
    }

    protected async hasInitialized() { // hasInitialized
        this._sharedSummaryBlock =
            await this.root.get<IFluidHandle<SharedSummaryBlock>>(this.sharedSummaryBlockId).get();
    }
}
