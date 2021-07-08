/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { LastEditedTracker } from "./lastEditedTracker";
import { IProvideFluidLastEditedTracker } from "./interfaces";
/**
 * LastEditedTrackerDataObject creates a LastEditedTracker that keeps track of the latest edits to the document.
 */
export declare class LastEditedTrackerDataObject extends DataObject implements IProvideFluidLastEditedTracker {
    private static readonly factory;
    static getFactory(): DataObjectFactory<LastEditedTrackerDataObject, object, undefined, import("@fluidframework/common-definitions").IEvent>;
    private readonly sharedSummaryBlockId;
    private _lastEditedTracker;
    private get lastEditedTracker();
    get IFluidLastEditedTracker(): LastEditedTracker;
    protected initializingFirstTime(): Promise<void>;
    protected hasInitialized(): Promise<void>;
}
//# sourceMappingURL=lastEditedTrackerDataObject.d.ts.map