/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    ISharedComponentProps,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

export const ReactComponentName = "react-component";
export const FluidComponentName = "fluid-component";

class FluidComponent extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() {return this;}
    private _viewElement: JSX.Element | undefined;
    constructor(
        props: ISharedComponentProps,
    ) {
        super(props);
    }

    // How can we add dynamically here if it is static
    private static readonly factory = new PrimedComponentFactory(
        FluidComponentName,
        FluidComponent,
        [],
        {});

    public static getFactory() {
        return FluidComponent.factory;
    }

    public setViewElement(e: JSX.Element) {
        this._viewElement = e;
    }

    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <div>{this._viewElement}</div>,
            div,
        );
    }
}

/**
 * A component to allow you to share your location with others
 */
export class ReactComponent<P,S> extends React.Component<P, S> implements IComponentHTMLView, IComponentLoadable {
    private readonly _fluidComponent: any;
    public root: ISharedDirectory;
    public handle: IComponentHandle;
    public url: string;
    public get IComponentHTMLView() {return this;}
    public get IComponentLoadable() {return this;}

    public static getFactory() {
        return FluidComponent.getFactory();
    }

    constructor(
        primedComponentProps: ISharedComponentProps,
        reactComponentProps: P,
        rootToProps: string[],
        stateToRoot: string[],
    ) {
        super(reactComponentProps);
        this._fluidComponent = new FluidComponent(
            primedComponentProps,
        );
        this.root = this._fluidComponent.root;
        this.handle = this._fluidComponent.handle;
        this.url = this._fluidComponent.url;
    }

    render() {
        const el = (
            <div style={{ border: "1px dotted blue" }}>
                <h3>Clicker</h3>
            </div>
        );
        this._fluidComponent.render(el);
        return el;
    }
}
