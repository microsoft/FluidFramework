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

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IComponentMountableViewClass.canMount}
     */
    public static canMount(view: IComponent) {
        return (
            React.isValidElement(view)
            || view.IComponentReactViewable !== undefined
            || view.IComponentHTMLView !== undefined
            || view.IComponentHTMLVisual !== undefined
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

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IComponentMountableViewClass.new}
     */
    constructor(private readonly view: IComponent) {
        if (!MountableView.canMount(this.view)) {
            throw new Error("Unmountable view type");
        }
    }

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IComponentMountableView.mount}
     */
    public mount(container: HTMLElement) {
        if (this.containerElement !== undefined) {
            throw new Error("Already mounted");
        }

        this.containerElement = container;

        // Try to get an IComponentHTMLView if we don't have one already.
        if (this.htmlView === undefined) {
            this.htmlView = this.view.IComponentHTMLView;
            if (this.htmlView === undefined) {
                this.htmlView = this.view.IComponentHTMLVisual?.addView();
            }
        }
        // Render with IComponentHTMLView if possible.
        if (this.htmlView !== undefined) {
            this.htmlView.render(this.containerElement);
            return;
        }

        // The ReactDOM.render calls won't work if the adapted component is from a separate bundle.
        // This is the usage scenario in webpack-component-loader currently in the case where the package we're
        // loading exports an IComponentFactory (rather than an IRuntimeFactory) because it will wrap the
        // component in a factory of its own creation.  So, prioritizing these below IComponentHTMLView and
        // IComponentHTMLVisual temporarily, so that we have the best chance of cross-bundle adaptation.
        // Try to get a React view if we don't have one already.
        if (this.reactView === undefined) {
            if (React.isValidElement(this.view)) {
                this.reactView = this.view;
            } else {
                this.reactView = this.view.IComponentReactViewable?.createJSXElement();
            }
        }
        // Render with React if possible.
        if (this.reactView !== undefined) {
            ReactDOM.render(this.reactView, this.containerElement);
            return;
        }

        // Should be unreachable -- we should have blown up in the constructor.
        throw new Error("Failed to mount");
    }

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IComponentMountableView.unmount}
     */
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
