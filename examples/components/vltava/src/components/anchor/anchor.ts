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
export class Anchor extends PrimedComponent implements IProvideComponentHTMLView {
    private readonly defaultComponentId = "default-component-id";
    private defaultComponentInternal: IComponentHTMLView | undefined;

    private get defaultComponent() {
        if (!this.defaultComponentInternal) {
            throw new Error("Default Component was not initialized properly");
        }

        return this.defaultComponentInternal;
    }

    private get lastEditedTrackerComponent() {
        if (!this.lastEditedTrackerComponentInternal) {
            throw new Error("Last Edited tracker was not initialized properly");
        }

        return this.lastEditedTrackerComponentInternal;
    }

    private static readonly factory = new PrimedComponentFactory(
        AnchorName,
        Anchor,
        [],
        [
            [ VltavaName, Promise.resolve(Vltava.getFactory()) ],
            [ LastEditedTrackerComponentName, Promise.resolve(LastEditedTrackerComponent.getFactory()) ],
        ],
        {},
    );

    public static getFactory() {
        return Anchor.factory;
    }

    public get IComponentHTMLView() { return this.defaultComponent; }

    protected async componentInitializingFirstTime(props: any) {
        const defaultComponent = await this.createAndAttachComponent("vltava");
        this.root.set(this.defaultComponentId, defaultComponent.handle);

        const lastEditedTrackerComponent = await this.createAndAttachComponent(LastEditedTrackerComponentName);
        this.root.set(this.lastEditedTrackerComponentId, lastEditedTrackerComponent.handle);
    }

    protected async componentHasInitialized() {
        this.defaultComponentInternal =
            (await this.root.get<IComponentHandle>(this.defaultComponentId).get())
                .IComponentHTMLView;
    }
}
