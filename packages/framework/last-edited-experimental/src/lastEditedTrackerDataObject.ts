/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import type { IEvent } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block";
import { IProvideFluidLastEditedTracker } from "./interfaces";
import { LastEditedTracker } from "./lastEditedTracker";

/**
 * LastEditedTrackerDataObject creates a LastEditedTracker that keeps track of the latest edits to the document.
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

    // The return type is defined explicitly here to prevent TypeScript from generating dynamic imports
    // eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-unnecessary-type-arguments
    public static getFactory(): DataObjectFactory<LastEditedTrackerDataObject, object, undefined, IEvent> {
        return LastEditedTrackerDataObject.factory;
    }

    private readonly sharedSummaryBlockId = "shared-summary-block-id";
    private _lastEditedTracker: LastEditedTracker | undefined;

    private get lastEditedTracker() {
        if (this._lastEditedTracker === undefined) {
            throw new Error("Last Edited tracker was not initialized properly");
        }

        return this._lastEditedTracker;
    }

    public get IFluidLastEditedTracker() { return this.lastEditedTracker; }

    protected async initializingFirstTime() {
        const sharedSummaryBlock = SharedSummaryBlock.create(this.runtime);
        this.root.set(this.sharedSummaryBlockId, sharedSummaryBlock.handle);
    }

    protected async hasInitialized() { // hasInitialized
        const sharedSummaryBlock =
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await this.root.get<IFluidHandle<SharedSummaryBlock>>(this.sharedSummaryBlockId)!.get();
        this._lastEditedTracker = new LastEditedTracker(sharedSummaryBlock);
    }
}
