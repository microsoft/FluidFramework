/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { SummarizableObject } from "@microsoft/fluid-summarizable-object";
import { IComponentLastEditedTracker, ILastEditDetails } from "./interfaces";
import { LastEditedTracker } from "./lastEditedTracker";

/**
 * LastEditedTrackerComponent creates a LastEditedTracker that keeps track of the latest edits to the document.
 */
export class LastEditedTrackerComponent extends PrimedComponent implements IComponentLastEditedTracker {
    private static readonly factory = new PrimedComponentFactory(
        LastEditedTrackerComponent,
        [ SummarizableObject.getFactory() ],
    );

    public static getFactory() {
        return LastEditedTrackerComponent.factory;
    }

    private readonly summarizableObjectId = "summarizable-object-id";
    private _lastEditedTracker: IComponentLastEditedTracker | undefined;

    private get lastEditedTracker() {
        if (this._lastEditedTracker === undefined) {
            throw new Error("Last Edited tracker was not initialized properly");
        }

        return this._lastEditedTracker;
    }

    public get IComponentLastEditedTracker() { return this; }

    /**
     * {@inheritDoc ILastEditedTracker.getLastEditDetails}
     */
    public getLastEditDetails(): ILastEditDetails | undefined {
        return this.lastEditedTracker.getLastEditDetails();
    }

    /**
     * {@inheritDoc ILastEditedTracker.updateLastEditDetails}
     */
    public updateLastEditDetails(message: ISequencedDocumentMessage) {
        this.lastEditedTracker.updateLastEditDetails(message);
    }

    public on(event: "lastEditedChanged", listener: (lastEditDetails: ILastEditDetails) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    protected async componentInitializingFirstTime(props: any) {
        const summarizableObject = SummarizableObject.create(this.runtime);
        this.root.set(this.summarizableObjectId, summarizableObject.handle);
    }

    protected async componentHasInitialized() {
        const summarizableObject =
            await this.root.get<IComponentHandle<SummarizableObject>>(this.summarizableObjectId).get();
        this._lastEditedTracker = new LastEditedTracker(summarizableObject);

        this._lastEditedTracker.on("lastEditedChanged", (lastEditDetails: ILastEditDetails) => {
            this.emit("lastEditedChanged", lastEditDetails);
        });
    }
}
