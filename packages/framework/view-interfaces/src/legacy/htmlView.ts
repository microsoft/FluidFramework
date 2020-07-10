/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IComponentHTMLOptions {
    display?: "block" | "inline";
}

export const IComponentHTMLView: keyof IProvideComponentHTMLView = "IComponentHTMLView";

export interface IProvideComponentHTMLView {
    readonly IComponentHTMLView: IComponentHTMLView;
}

/**
 * An IComponentHTMLView is a renderable component, which may or may not also be its own model.
 * If it is its own model, it is a "thick" view, otherwise it is a "thin" view.
 */
export interface IComponentHTMLView extends IProvideComponentHTMLView {
    /**
     * Render the component into an HTML element. In the case of Block display,
     * elm.getBoundingClientRect() defines the dimensions of the viewport in which
     * to render. Typically, this means that elm should already be placed into the DOM.
     * If elm has an empty client rect, then it is assumed that it will expand to hold the
     * rendered component.
     */
    render(elm: HTMLElement, options?: IComponentHTMLOptions): void;

    /**
     * Views which need to perform cleanup (e.g. remove event listeners, timers, etc.) when
     * removed from the DOM should implement remove() and perform that cleanup within.
     * Components which wish to remove views from the DOM should call remove() on the view
     * before removing it from the DOM.
     */
    remove?(): void;
}

declare module "@fluidframework/component-core-interfaces" {
    /* eslint-disable @typescript-eslint/no-empty-interface */
    export interface IComponent extends
        Readonly<Partial<IProvideComponentHTMLView>> { }
    /* eslint-enable @typescript-eslint/no-empty-interface */
}
