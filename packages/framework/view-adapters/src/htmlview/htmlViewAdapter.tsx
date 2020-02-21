/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLOptions, IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IComponentReactViewable } from "../interfaces";

/**
 * Abstracts rendering of components via the IComponentHTMLView interface.  Supports React elements, as well as
 * components that implement IComponentReactViewable, IComponentHTMLView, or IComponentHTMLVisual.
 *
 * If the component is none of these, we render an empty <span />
 */
export class HTMLViewAdapter implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }
    constructor(private readonly component: IComponent) { }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions) {
        if (React.isValidElement(this.component)) {
            ReactDOM.render(this.component, elm);
            return;
        }

        const reactViewable = this.component.IComponentReactViewable;
        if (reactViewable !== undefined) {
            ReactDOM.render(<ReactViewableEmbeddedComponent component={reactViewable} />, elm);
            return;
        }

        const htmlView = this.component.IComponentHTMLView;
        if (htmlView !== undefined) {
            htmlView.render(elm, options);
            return;
        }

        const htmlVisual = this.component.IComponentHTMLVisual;
        if (htmlVisual !== undefined) {
            const view = htmlVisual.addView();
            view.render(elm, options);
            return;
        }

        elm.appendChild(document.createElement("span"));
    }
}

interface IReactProps {
    component: IComponentReactViewable;
}

/**
 * Embeds a Fluid Component that supports IComponentReactViewable
 */
const ReactViewableEmbeddedComponent = (props: IReactProps) => props.component.createJSXElement();
