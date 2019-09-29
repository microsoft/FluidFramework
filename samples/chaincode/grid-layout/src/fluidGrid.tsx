/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { SharedMap } from "@microsoft/fluid-map";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { FluidGridView, GridCellLayout } from "./react/fluidGridView";

import "./helpers/styles.css";

export const FluidGridName = "FluidGrid";

/**
 * A collaborative grid-layout component.
 */
export class FluidGrid extends PrimedComponent implements IComponentHTMLVisual, IComponentReactViewable {
    public get IComponentHTMLVisual() {
        return this;
    }

    public get IComponentReactViewable() {
        return this;
    }

    public static getFactory() {
        return this.factory;
    }

    /**
     * This is where you define all your Distributed Data Structures
     */
    private static readonly factory = new PrimedComponentFactory(FluidGrid, [
        SharedMap.getFactory(),
        SharedCell.getFactory(),
    ]);

    private layout: ISharedCell;
    private readonly layoutKey = "layout";

    private readonly defaultLayout: GridCellLayout[] = [
        { i: "a", x: 0, y: 0, w: 1, h: 2, static: true },
        { i: "b", x: 1, y: 0, w: 3, h: 2, minW: 2, maxW: 4 },
        { i: "c", x: 4, y: 0, w: 1, h: 2 },
    ];

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time
     * your component is created. Anything that happens in componentInitializingFirstTime will happen before any other
     * user will see the component.
     */
    protected async componentInitializingFirstTime() {
        const layoutStorage = SharedCell.create(this.runtime);
        layoutStorage.set(this.defaultLayout);
        this.root.set(this.layoutKey, layoutStorage.handle);
    }

    /**
     * This method will be called whenever the component has initialized, be it the first time or subsequent times.
     */
    protected async componentHasInitialized() {
        // Shared objects that are stored within other Shared objects (e.g. a SharedMap within the root, which is a
        // SharedDirectory) must be retrieved asynchronously. We do that here, in this async function, then store a
        // local reference to the object so we can easily use it in synchronous code.
        this.layout = await this.root.get<IComponentHandle>(this.layoutKey).get<ISharedCell>();
    }

    public createJSXElement(props?): JSX.Element {
        return <FluidGridView storage={this.layout}></FluidGridView>;
    }

    /**
     * This method is called automatically by the Fluid runtime.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(this.createJSXElement(), div);
    }
}
