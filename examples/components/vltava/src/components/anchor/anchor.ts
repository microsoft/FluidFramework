/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
    IComponentHTMLVisual,
    IProvideComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";

import uuid from "uuid/v4";

/**
 * Anchor is an default component is responsible for managing creation and the default component
 */
export class Anchor extends PrimedComponent implements IProvideComponentHTMLVisual {
    private readonly defaultComponentId = "default-component-id";
    private defaultComponentInternal: IComponentHTMLVisual | undefined;

    private get defaultComponent() {
        if (!this.defaultComponentInternal) {
            throw new Error("Default Component was not initialized properly");
        }

        return this.defaultComponentInternal;
    }

    private static readonly factory = new PrimedComponentFactory(Anchor, []);

    public static getFactory() {
        return Anchor.factory;
    }

    public get IComponentHTMLVisual() { return this.defaultComponent; }

    protected async componentInitializingFirstTime(props: any) {
        const defaultComponent = await this.createAndAttachComponent<IComponent>(uuid(), "vltava");
        this.root.set(this.defaultComponentId, defaultComponent.IComponentHandle);
    }

    protected async componentHasInitialized() {
        this.defaultComponentInternal =
            (await this.root.get<IComponentHandle>(this.defaultComponentId).get())
                .IComponentHTMLVisual;
    }
}
