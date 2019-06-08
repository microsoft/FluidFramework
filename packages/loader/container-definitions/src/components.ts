import { IRequest, IResponse } from "./loader";

export interface IComponent {
    /**
     * Queries for an interface of the given ID
     */
    query<T>(id: string): Promise<T>;

    /**
     * Returns a list of all interfaces
     */
    list(): Promise<string[]>;

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
    addView(host: IComponent, element: HTMLElement): Promise<IHTMLView>;
}

/**
 * HTML View for a component
 */
export interface IHTMLView {
    remove();
}
