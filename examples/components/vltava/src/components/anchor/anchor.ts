/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponentLastEditedTracker,
    IProvideComponentLastEditedTracker,
    LastEditedTrackerComponentName,
} from "@microsoft/fluid-last-edited-experimental";
import { IComponentHTMLView, IProvideComponentHTMLView } from "@microsoft/fluid-view-interfaces";

export const AnchorName = "anchor";

/**
 * Anchor is an default component is responsible for managing creation and the default component
 */
export class Anchor extends PrimedComponent implements IProvideComponentHTMLView, IProvideComponentLastEditedTracker {
    private readonly defaultComponentId = "default-component-id";
    private defaultComponentInternal: IComponentHTMLView | undefined;
    private readonly lastEditedComponentId = "last-edited-component-id";
    private lastEditedComponent: IComponentLastEditedTracker | undefined;

    private get defaultComponent() {
        if (!this.defaultComponentInternal) {
            throw new Error("Default Component was not initialized properly");
        }

        return this.defaultComponentInternal;
    }

    private static readonly factory = new PrimedComponentFactory(AnchorName, Anchor, [], {});

    public static getFactory() {
        return Anchor.factory;
    }

    public get IComponentHTMLView() { return this.defaultComponent; }

    public get IComponentLastEditedTracker() {
        if (!this.lastEditedComponent) {
            throw new Error("LastEditedTrackerComponent was not initialized properly");
        }

        return this.lastEditedComponent;
    }

    protected async componentInitializingFirstTime() {
        const defaultComponent = await this.createAndAttachComponent("vltava");
        this.root.set(this.defaultComponentId, defaultComponent.handle);

        const lastEditedComponent = await this.createAndAttachComponent(LastEditedTrackerComponentName);
        this.root.set(this.lastEditedComponentId, lastEditedComponent.handle);
    }

    protected async componentHasInitialized() {
        this.defaultComponentInternal =
            (await this.root.get<IComponentHandle>(this.defaultComponentId).get())
                .IComponentHTMLView;

        this.lastEditedComponent =
                (await this.root.get<IComponentHandle>(this.lastEditedComponentId).get())
                    .IComponentLastEditedTracker;
    }
}
