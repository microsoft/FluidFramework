/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLRender, IComponentHTMLVisual } from "./componentRender";
import { IComponentRouter } from "./componentRouter";

/**
 * Query and list are deprecated. This interface provides access to
 * those functions on legacy components.
 * TODO: It should be removed in the next release 0.9
 */
export interface IComponentQueryableLegacy {
    /**
     * Queries for an interface of the given ID
     *
     *
     */
    query?<T>(id: string): T | undefined;

    /**
     * Returns a list of all interfaces
     */
    list?(): string[];

    /**
     * Disposes of the reference to the component
     */
    // dispose(): void;
}

export interface IComponent {
    readonly IComponentLoadable?: IComponentLoadable;
    readonly IComponentRunnable?: IComponentRunnable;
    readonly IComponentRouter?: IComponentRouter;
    readonly IComponentHTMLRender?: IComponentHTMLRender;
    readonly IComponentHTMLVisual?: IComponentHTMLVisual;
}

export interface IComponentLoadable extends IComponent {
    // absolute URL to the component within the document
    url: string;
    readonly IComponentLoadable: IComponentLoadable;
}

export interface IComponentRunnable extends IComponent {
    readonly IComponentRunnable: IComponentRunnable;
    run(): Promise<void>;
}

/**
 * A shared component has a URL from which it can be referenced
 */
export interface ISharedComponent extends IComponent, IComponentLoadable {
    readonly IComponentLoadable: IComponentLoadable;
}

export interface IComponentConfiguration {
    readonly IComponentConfiguration: IComponentConfiguration;
    canReconnect: boolean;
}

export interface IComponentTokenProvider {
    intelligence: { [service: string]: any };
}
