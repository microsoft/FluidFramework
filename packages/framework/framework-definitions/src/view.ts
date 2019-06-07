import { ICapabilities } from "./capabilities";

/**
 * Returns true if 'candidate' implements IViewProvider.
 */
export function isViewProvider(candidate: object): candidate is IViewProvider {
    return "viewProvider" in candidate;
}

/**
 * Exposes this object's capability to present itself via the DOM.  Use the 'isViewProvider()'
 * type guard to detect the presence of this interface.
 */
export interface IViewProvider {
    viewProvider: Promise<{
        createView(capabilities?: ICapabilities): IView;
    }>;
}

/**
 * IView is the generic interface for hosting the user interface provided by a Fluid component.
 *
 * To provide a user interface, a Fluid component implements the IViewProvider interface, which
 * the host uses to create an unique IView instance for each view of the component.
 */
export interface IView {
    /**
     * Attaches this IView's DOM nodes as children of the given 'root' node.  Once attached, it is the
     * IView's responsibility to observe changes to the underlying model and synchronize the DOM.
     *
     * The 'root' node provided by the caller must be a new empty DOM node that is unique to this
     * IView (typically a shadow root.)  The IView owns the 'root' node until it is detached.
     *
     * An IView should typically delay building DOM nodes, subscribing to events, etc. until it is
     * attached to minimize resource utilization.
     */
    attach(root: Node);

    /**
     * Instructs the IView to remove its children from the 'root' node and take any additional steps
     * necessary to ensure its resources are available for garbage collection (e.g., unsubscribing
     * event listeners.)
     */
    detach(): void;
}
