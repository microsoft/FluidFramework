/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "./components";

// Following is what loosely-coupled hosts need to show a component

/**
 * Render the component into an HTML element. In the case of Block display,
 * elm.getBoundingClientRect() defines the dimensions of the viewport in which
 * to render. Typically, this means that elm should already be placed into the DOM.
 * If elm has an empty client rect, then it is assumed that it will expand to hold the
 * rendered component.
 */
export interface IComponentHTMLRender {
    readonly IComponentHTMLRender: IComponentHTMLRender;
    render(elm: HTMLElement, options?: IComponentHTMLOptions): void;
}

export interface IComponentHTMLOptions {
    display?: "block" | "inline";
}

export interface IComponentHTMLView extends IComponentHTMLRender {
    remove(): void;
}

export interface IComponentHTMLVisual extends IComponentHTMLRender {
    readonly IComponentHTMLVisual: IComponentHTMLVisual;
    addView?(scope?: IComponent): IComponentHTMLView;
}
