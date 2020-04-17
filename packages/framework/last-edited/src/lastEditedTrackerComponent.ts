/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { SharedSummaryBlock } from "@microsoft/fluid-shared-summary-block";
import {
    IComponentLastEditedTracker,
    IProvideComponentLastEditedTracker,
} from "./interfaces";
import { LastEditedTracker } from "./lastEditedTracker";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const LastEditedTrackerComponentName = pkg.name as string;

/**
 * LastEditedTrackerComponent creates a LastEditedTracker that keeps track of the latest edits to the document.
 */
export class LastEditedTrackerComponent extends PrimedComponent implements IProvideComponentLastEditedTracker {
    private static readonly factory = new PrimedComponentFactory(
        LastEditedTrackerComponentName,
        LastEditedTrackerComponent,
        [ SharedSummaryBlock.getFactory() ],
    );

    public static getFactory() {
        return LastEditedTrackerComponent.factory;
    }

    private readonly sharedSummaryBlockId = "shared-summary-block-id";
    private _lastEditedTracker: IComponentLastEditedTracker | undefined;

    private get lastEditedTracker() {
        if (this._lastEditedTracker === undefined) {
            throw new Error("Last Edited tracker was not initialized properly");
        }

        return this._lastEditedTracker;
    }

    public get IComponentLastEditedTracker() { return this.lastEditedTracker; }

    protected async componentInitializingFirstTime(props: any) {
        const sharedSummaryBlock = SharedSummaryBlock.create(this.runtime);
        this.root.set(this.sharedSummaryBlockId, sharedSummaryBlock.handle);
    }

    protected async componentHasInitialized() {
        const sharedSummaryBlock =
            await this.root.get<IComponentHandle<SharedSummaryBlock>>(this.sharedSummaryBlockId).get();
        this._lastEditedTracker = new LastEditedTracker(sharedSummaryBlock, this.context.getQuorum());
    }
}
