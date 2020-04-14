/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView, IProvideComponentHTMLView } from "@microsoft/fluid-view-interfaces";

export const AnchorName = "anchor";

/**
 * Anchor is an default component is responsible for managing creation and the default component
 */
export class Anchor extends PrimedComponent implements IProvideComponentHTMLView, IProvideComponentLastEditedTracker {
    private readonly defaultComponentId = "default-component-id";
    private readonly lastEditedViewerComponentId = "last-edited-viewer-component-id";
    private defaultComponentInternal: IComponentHTMLView | undefined;
    private lastEditedViewerComponentInternal: IComponentLastEditedTracker | undefined;

    private get defaultComponent() {
        if (!this.defaultComponentInternal) {
            throw new Error("Default Component was not initialized properly");
        }

        return this.defaultComponentInternal;
    }

    private get lastEditedViewerComponent() {
        if (!this.lastEditedViewerComponentInternal) {
            throw new Error("Last Edited tracker was not initialized properly");
        }

        return this.lastEditedViewerComponentInternal;
    }

    private static readonly factory = new PrimedComponentFactory(AnchorName, Anchor, [], {});

    public static getFactory() {
        return Anchor.factory;
    }

    public get IComponentHTMLView() { return this.defaultComponent; }

    public get IComponentLastEditedTracker() { return this.lastEditedViewerComponent; }

    protected async componentInitializingFirstTime(props: any) {
        const defaultComponent = await this.createAndAttachComponent("vltava");
        this.root.set(this.defaultComponentId, defaultComponent.handle);

        const lastEditedViewerComponent = await this.createAndAttachComponent("lastEditedViewer");
        this.root.set(this.lastEditedViewerComponentId, lastEditedViewerComponent.handle);
    }

    protected async componentHasInitialized() {
        this.defaultComponentInternal =
            (await this.root.get<IComponentHandle>(this.defaultComponentId).get())
                .IComponentHTMLView;

        this.lastEditedViewerComponentInternal =
            (await this.root.get<IComponentHandle>(this.lastEditedViewerComponentId).get())
                .IComponentLastEditedTracker;
    }
}
