/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block";
import { LastEditedTracker } from "./lastEditedTracker";
/**
 * LastEditedTrackerDataObject creates a LastEditedTracker that keeps track of the latest edits to the document.
 */
export class LastEditedTrackerDataObject extends DataObject {
    constructor() {
        super(...arguments);
        this.sharedSummaryBlockId = "shared-summary-block-id";
    }
    static getFactory() {
        return LastEditedTrackerDataObject.factory;
    }
    get lastEditedTracker() {
        if (this._lastEditedTracker === undefined) {
            throw new Error("Last Edited tracker was not initialized properly");
        }
        return this._lastEditedTracker;
    }
    get IFluidLastEditedTracker() { return this.lastEditedTracker; }
    async initializingFirstTime() {
        const sharedSummaryBlock = SharedSummaryBlock.create(this.runtime);
        this.root.set(this.sharedSummaryBlockId, sharedSummaryBlock.handle);
    }
    async hasInitialized() {
        const sharedSummaryBlock = 
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await this.root.get(this.sharedSummaryBlockId).get();
        this._lastEditedTracker = new LastEditedTracker(sharedSummaryBlock);
    }
}
LastEditedTrackerDataObject.factory = new DataObjectFactory("@fluidframework/last-edited-experimental", LastEditedTrackerDataObject, [SharedSummaryBlock.getFactory()], {}, undefined);
//# sourceMappingURL=lastEditedTrackerDataObject.js.map