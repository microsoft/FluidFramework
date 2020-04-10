/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentLastEditedTracker,
    ILastEditedTracker,
    LastEditedTracker,
} from "@microsoft/fluid-last-edited";
import { SummarizableObject } from "@microsoft/fluid-summarizable-object";

/**
 * LastEditedViewer creates a LastEditedTracker that keeps track of the latest edits to the document.
 */
export class LastEditedViewer extends PrimedComponent implements IComponentLastEditedTracker {
    private static readonly factory = new PrimedComponentFactory(
        LastEditedViewer,
        [ SummarizableObject.getFactory() ],
    );

    public static getFactory() {
        return LastEditedViewer.factory;
    }

    private readonly summarizableObjectId = "summarizable-object-id";
    private _lastEditedTracker: ILastEditedTracker | undefined;

    public get lastEditedTracker(): ILastEditedTracker {
        if (!this._lastEditedTracker) {
            throw new Error("Last Edited tracker not yet created");
        }
        return this._lastEditedTracker;
    }

    public get IComponentLastEditedTracker() { return this; }

    protected async componentInitializingFirstTime(props: any) {
        const summarizableObject = SummarizableObject.create(this.runtime);
        this.root.set(this.summarizableObjectId, summarizableObject.handle);
    }

    protected async componentHasInitialized() {
        const summarizableObject =
            await this.root.get<IComponentHandle<SummarizableObject>>(this.summarizableObjectId).get();
        this._lastEditedTracker = new LastEditedTracker(summarizableObject, this.runtime.getQuorum());
    }
}
