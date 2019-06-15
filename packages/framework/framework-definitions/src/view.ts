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
export interface IView extends HTMLElement { }
