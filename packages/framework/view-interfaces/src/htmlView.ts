/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IFluidHTMLOptions {
    display?: "block" | "inline";
}

export const IFluidHTMLView: keyof IProvideFluidHTMLView = "IFluidHTMLView";

export interface IProvideFluidHTMLView {
    readonly IFluidHTMLView: IFluidHTMLView;
}

/**
 * An IFluidHTMLView is a renderable object, which may or may not also be its own model.
 * If it is its own model, it is a "thick" view, otherwise it is a "thin" view.
 */
export interface IFluidHTMLView extends IProvideFluidHTMLView {
    /**
     * Render the view into an HTML element. In the case of Block display,
     * elm.getBoundingClientRect() defines the dimensions of the viewport in which
     * to render. Typically, this means that elm should already be placed into the DOM.
     * If elm has an empty client rect, then it is assumed that it will expand to hold the
     * rendered view.
     */
    render(elm: HTMLElement, options?: IFluidHTMLOptions): void;

    /**
     * Views which need to perform cleanup (e.g. remove event listeners, timers, etc.) when
     * removed from the DOM should implement remove() and perform that cleanup within.
     * Fluid Objects which wish to remove views from the DOM should call remove() on the view
     * before removing it from the DOM.
     */
    remove?(): void;
}
