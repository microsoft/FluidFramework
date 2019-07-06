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

/**
 * Interface for viewing a Fluid component with the HTML DOM
 */
export interface IComponentHTMLViewable {
    addView(host: IComponent, element: HTMLElement): Promise<IHTMLView>;
}

/**
 * HTML View for a component
 */
export interface IHTMLView {
    remove();
}
