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
    createView(host?: IComponent): IHTMLView;
}

/**
 * The root element of a subtree used by a view implementation to present a Fluid component to the DOM.
 * Note that IHTMLView extends HTMLElement, and that 'createView()' only returns a reference to the root
 * HTMLElement.  The view implementation is opaque.
 *
 * Typically, the root node constructed by 'createView()' is a custom element.
 *
 * Once connected, it is the view implementation's responsibility to observe changes to the model and
 * synchronize the DOM subtree.  Any side-effects should be constrained to the view's DOM subtree.
 *
 * To conserve resources, a view should delay building child nodes, subscribing to events, etc.
 * until it is connected.
 *
 * On disconnection, a view should take any steps necessary to ensure its resources are available for garbage
 * collection (e.g., unsubscribing from event listeners).
 */
// tslint:disable-next-line:no-empty-interface
export interface IHTMLView extends HTMLElement {
    // By convention, an IHTMLView implementation has a static 'tagName' property that is the name
    // assigned to the element in the custom element registry.
}
