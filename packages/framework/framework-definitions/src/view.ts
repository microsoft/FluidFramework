/**
 * The IViewProvider interface exposes this object's capability to present itself via the DOM.
 */
export interface IViewProvider {
    /**
     * Each call to 'createView()' constructs and returns a unique view instance.
     */
    createView(): IView;
}

/**
 * An IView instance is an HTML5 custom element responsible for presenting a Fluid component.
 * Once connected, it is the IView's responsibility to observe changes to the model and synchronize
 * the DOM.
 *
 * An IView should typically delay building child nodes, subscribing to events, etc. until it is
 * connected to minimize resource utilization.
 *
 * On disconnection, an IView is responsible for taking any steps necessary to ensure its resources
 * are available for garbage collection (e.g., unsubscribing from event listeners).
 */
// tslint:disable-next-line:no-empty-interface
export interface IView extends HTMLElement { }
