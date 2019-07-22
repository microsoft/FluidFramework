/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "./loader";

export interface IComponent {
    /**
     * Queries for an interface of the given ID
     */
    query<T>(id: string): T | undefined;

    /**
     * Returns a list of all interfaces
     */
    list(): string[];

    /**
     * Disposes of the reference to the component
     */
    // dispose(): void;
}

export interface IComponentLoadable extends IComponent {
    // absolute URL to the component within the document
    url: string;
}

export interface IComponentRunnable extends IComponent {
    run(): Promise<void>;
}

/**
 * A shared component has a URL from which it can be referenced
 */
export interface ISharedComponent extends IComponent, IComponentLoadable {
}

/**
 * Request routing
 */
export interface IComponentRouter {
    request(request: IRequest): Promise<IResponse>;
}

// Following is what loosely-coupled hosts need to show a component

/**
 * Render the component into an HTML element. In the case of Block display,
 * elm.getBoundingClientRect() defines the dimensions of the viewport in which
 * to render. Typically, this means that elm should already be placed into the DOM.
 * If elm has an empty client rect, then it is assumed that it will expand to hold the
 * rendered component.
 */
export interface IComponentHTMLRender extends IComponent {
    render(elm: HTMLElement, options?: IComponentHTMLOptions): void;
}

export interface IComponentHTMLOptions {
    display?: "block" | "inline";
}

export interface IComponentHTMLView extends IComponentHTMLRender {
    remove(): void;
}

export interface IComponentHTMLVisual extends IComponentHTMLRender {
    addView?(scope?: IComponent): IComponentHTMLView;
}
