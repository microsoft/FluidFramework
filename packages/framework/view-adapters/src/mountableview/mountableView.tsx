/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { IComponentHTMLView, IComponentMountableView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Abstracts mounting of views for usage outside of their bundle.  Supports React elements, as well as
 * components that implement IComponentReactViewable, IComponentHTMLView, or IComponentHTMLVisual.
 *
 * The MountableView must be applied from within the same bundle that provides the view, and then that MountableView
 * can be used by a separate bundle.  Attempting to apply a MountableView to a view that was retrieved from a separate
 * bundle is not supported.
 */
export class MountableView implements IComponentMountableView {
    public get IComponentMountableView() { return this; }

    public static canMount(viewProvider: IComponent) {
        return (
            React.isValidElement(viewProvider)
            || viewProvider.IComponentReactViewable !== undefined
            || viewProvider.IComponentHTMLView !== undefined
            || viewProvider.IComponentHTMLVisual !== undefined
        );
    }

    /**
     * A reference to the current container node for this view so we can do DOM cleanup.
     * This also doubles as a way for us to know if we are mounted or not.
     */
    private containerElement: HTMLElement | undefined;

    /**
     * If the viewProvider is an IComponentHTMLView or IComponentHTMLVisual we will retain a reference to the
     * IComponentHTMLView (creating one if it's a Visual), which we will retain across rendering/removal.
     */
    private htmlView: IComponentHTMLView | undefined;

    /**
     * If the viewProvider is a React component or IComponentReactViewable we will retain a reference to the
     * React component (creating one if it's a ReactViewable), which we will retain across rendering/removal.
     */
    private reactView: JSX.Element | undefined;

    constructor(private readonly viewProvider: IComponent) {
        if (!MountableView.canMount(this.viewProvider)) {
            throw new Error("Unmountable view type");
        }
    }

    public mount(container: HTMLElement) {
        if (this.containerElement !== undefined) {
            throw new Error("Already mounted");
        }

        this.containerElement = container;

        // Try to get a React view if we don't have one already.
        if (this.reactView === undefined) {
            if (React.isValidElement(this.viewProvider)) {
                this.reactView = this.viewProvider;
            } else {
                this.reactView = this.viewProvider.IComponentReactViewable?.createJSXElement();
            }
        }
        // Render with React if possible.
        if (this.reactView !== undefined) {
            ReactDOM.render(this.reactView, this.containerElement);
            return;
        }

        // Try to get an IComponentHTMLView if we don't have one already.
        if (this.htmlView === undefined) {
            this.htmlView = this.viewProvider.IComponentHTMLView;
            if (this.htmlView === undefined) {
                this.htmlView = this.viewProvider.IComponentHTMLVisual?.addView();
            }
        }
        // Render with IComponentHTMLView if possible.
        if (this.htmlView !== undefined) {
            this.htmlView.render(this.containerElement);
            return;
        }

        // Should be unreachable -- we should have blown up in the constructor.
        throw new Error("Failed to mount");
    }

    public unmount() {
        // Do nothing if we are already unmounted.
        if (this.containerElement === undefined) {
            return;
        }

        // Call appropriate cleanup methods on the view and then remove it from the DOM.
        if (this.reactView !== undefined) {
            ReactDOM.unmountComponentAtNode(this.containerElement);
        } else if (this.htmlView !== undefined) {
            if (this.htmlView.remove !== undefined) {
                this.htmlView.remove();
            }
            // eslint-disable-next-line no-null/no-null
            while (this.containerElement.firstChild !== null) {
                this.containerElement.removeChild(this.containerElement.firstChild);
            }
        }

        this.containerElement = undefined;
    }
}
