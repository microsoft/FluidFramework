/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IFluidObject } from "@fluidframework/component-core-interfaces";
import {
    IComponentHTMLOptions,
    IComponentHTMLView,
    IFluidHTMLView,
    IFluidHTMLOptions,
} from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

/**
 * Abstracts rendering of views via the IComponentHTMLView interface.  Supports React elements, as well as
 * components that implement IComponentHTMLView.
 */
export class HTMLViewAdapter implements IComponentHTMLView, IFluidHTMLView {
    public get IComponentHTMLView() { return this; }
    public get IFluidHTMLView() { return this; }

    /**
     * Test whether the given view can be successfully adapted by an HTMLViewAdapter.
     * @param view - the view to test if it is adaptable.
     */
    public static canAdapt(view: IComponent & IFluidObject) {
        return (
            React.isValidElement(view)
            || view.IComponentHTMLView !== undefined
            || view.IFluidHTMLView !== undefined
        );
    }

    /**
     * A reference to the current container node for this view so we can unmount it appropriately in
     * the React case.  This also doubles as a way for us to know if we are mounted or not.
     */
    private containerNode: HTMLElement | undefined;

    /**
     * @param view - The view to adapt into an IComponentHTMLView
     */
    constructor(private readonly view: IComponent & IFluidObject) { }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions | IFluidHTMLOptions) {
        // Note that if we're already mounted, this can cause multiple rendering with possibly unintended effects.
        // Probably try to avoid doing this.
        this.containerNode = elm;

        const htmlView = this.view.IComponentHTMLView ?? this.view.IFluidHTMLView;
        if (htmlView !== undefined) {
            htmlView.render(elm, options);
            return;
        }

        // The ReactDOM.render call won't work if the adapted component is from a separate bundle.
        // This is the usage scenario in webpack-component-loader currently, so prioritizing this below
        // IComponentHTMLView temporarily, so that we have the best chance of cross-bundle adaptation.
        if (React.isValidElement(this.view)) {
            ReactDOM.render(this.view, elm);
            return;
        }

        // Either it's an unrenderable component, or using some framework we don't support.
        // In that case, we render nothing.
    }

    /**
     * Performs cleanup on the view and removes it from the DOM.
     */
    public remove() {
        if (this.containerNode === undefined) {
            // Then we are already unmounted.
            return;
        }

        if (React.isValidElement(this.view)) {
            // Not ideal - this will also remove the component from the DOM.  But not sure how else to enter into
            // componentWillUnmount handling which is what we really want.
            ReactDOM.unmountComponentAtNode(this.containerNode);
            this.containerNode = undefined;
            return;
        }

        const htmlView = this.view.IComponentHTMLView ?? this.view.IFluidHTMLView;
        if (htmlView !== undefined && htmlView.remove !== undefined) {
            htmlView.remove();
            this.containerNode = undefined;
            return;
        }
    }
}
