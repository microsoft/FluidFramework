/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import {
    IFluidHTMLView,
    IFluidMountableView,
} from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Abstracts mounting of views for usage outside of their bundle.  Supports React elements, as well as
 * objects that implement IFluidHTMLView.
 *
 * The MountableView must be applied from within the same bundle that provides the view, and then that MountableView
 * can be used by a separate bundle.  Attempting to apply a MountableView to a view that was retrieved from a separate
 * bundle is not supported.
 */
export class MountableView implements IFluidMountableView {
    public get IFluidMountableView() { return this; }

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IFluidMountableViewClass.canMount}
     */
    public static canMount(view: FluidObject) {
        const maybeView: FluidObject<IFluidHTMLView> = view;
        return (
            React.isValidElement(view)
            || maybeView.IFluidHTMLView !== undefined
        );
    }

    /**
     * A reference to the current container node for this view so we can do DOM cleanup.
     * This also doubles as a way for us to know if we are mounted or not.
     */
    private containerElement: HTMLElement | undefined;

    /**
     * If the view is an IFluidHTMLView we will retain a reference to it across rendering/removal.
     */
    private htmlView: IFluidHTMLView | undefined;

    /**
     * If the viewProvider is a React component we will retain a reference to the React component across
     * rendering/removal.
     */
    private reactView: JSX.Element | undefined;

    private readonly view: FluidObject;

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IFluidMountableViewClass.new}
     */
    constructor(view: FluidObject) {
        if (!MountableView.canMount(view)) {
            throw new Error("Unmountable view type");
        }
        this.view = view;
    }

    /**
     * {@inheritDoc @fluidframework/view-interfaces#IFluidMountableView.mount}
     */
    public mount(container: HTMLElement) {
        if (this.containerElement !== undefined) {
            throw new Error("Already mounted");
        }

        this.containerElement = container;

        // Try to get an IFluidHTMLView if we don't have one already.
        if (this.htmlView === undefined) {
            const maybeHtmlView: FluidObject<IFluidHTMLView> = this.view;
            this.htmlView = maybeHtmlView.IFluidHTMLView;
        }
        // Render with IFluidHTMLView if possible.
        if (this.htmlView !== undefined) {
            this.htmlView.render(this.containerElement);
            return;
        }

        // The ReactDOM.render call won't work if the adapted Fluid object is from a separate bundle.
        // This is the usage scenario in webpack-fluid-loader currently in the case where the package we're
        // loading exports an IFluidDataStoreFactory (rather than an IRuntimeFactory) because it will wrap the
        // Fluid object in a factory of its own creation.  So, prioritizing this below IFluidHTMLView
        // temporarily, so that we have the best chance of cross-bundle adaptation.
        // Try to get a React view if we don't have one already.
        if (this.reactView === undefined && React.isValidElement(this.view)) {
            this.reactView = this.view;
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
     * {@inheritDoc @fluidframework/view-interfaces#IFluidMountableView.unmount}
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
