import { IRequest, IResponse } from "./loader";

export interface IComponent {
    /**
     * Queries for an interface of the given ID
     */
    query<T>(id: string): T;

    /**
     * Returns a list of all interfaces
     */
    list(): string[];

    /**
     * Disposes of the reference to the component
     */
    // dispose(): void;
}

export interface IComponentLoadable {
    // absolute URL to the component within the document
    url: string;
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
 * Interface for viewing a Prague component with the HTML DOM
 */
export interface IComponentHTMLViewable {
    /**
     * Each call to 'createView()' constructs and returns a unique view instance.
     */
    createView(host?: IComponent): Promise<IHTMLView>;
}

/**
 * An IHTMLView instance is an HTML5 custom element responsible for presenting a Fluid component.
 * Once connected, it is the IHTMLView's responsibility to observe changes to the model and synchronize
 * the DOM.
 *
 * An IHTMLView should typically delay building child nodes, subscribing to events, etc. until it is
 * connected to minimize resource utilization.
 *
 * On disconnection, an IHTMLView is responsible for taking any steps necessary to ensure its resources
 * are available for garbage collection (e.g., unsubscribing from event listeners).
 */
// tslint:disable-next-line:no-empty-interface
export interface IHTMLView extends HTMLElement {
    // By convention, an IHTMLView implementation has a static 'tagName' property that is the name
    // assigned to the element in the custom element registry.
}
