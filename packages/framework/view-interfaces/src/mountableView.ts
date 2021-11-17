/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";

export const IFluidMountableView: keyof IProvideFluidMountableView = "IFluidMountableView";

export interface IProvideFluidMountableView {
    readonly IFluidMountableView: IFluidMountableView;
}

/**
 * IFluidMountableViewClass defines the statics on our class implementing IFluidMountableView.
 */
export interface IFluidMountableViewClass {
    /**
     * @param view - The view to make mountable
     */
    new(view: FluidObject): IFluidMountableView;
    /**
     * Test whether the given view can be successfully mounted by a MountableView.
     * @param view - the view to test if it can be mounted.
     */
    canMount(view: FluidObject): boolean;
}

/**
 * An IFluidMountableView provides a view bundled with a mounting mechanism.  That view can be mounted and
 * unmounted from a given element.  This bundling of view + mounting mechanism is important for React, which
 * needs the same React instance to be used for the mounting ReactDOM.render() call as the Fluid object it's mounting,
 * or else React hooks don't work.  This is the case in scenarios like webpack-fluid-loader, which attempts
 * to do cross-bundle mounting.
 *
 * This is not intended to be used as a general rendering/mounting approach, but rather as just a specific solution
 * for cross-bundle mounting.  General rendering/mounting should instead use the view adapters or make direct calls
 * to framework-specific rendering APIs.
 */
export interface IFluidMountableView extends IProvideFluidMountableView {
    /**
     * Mounts the view at the given element.
     * @param container - the DOM parent of the view we will mount
     */
    mount(container: HTMLElement): void;

    /**
     * Performs any necessary cleanup for the view and then removes it from the DOM.
     */
    unmount(): void;
}

declare module "@fluidframework/core-interfaces" {
    export interface IFluidObject {
        /** @deprecated - use `FluidObject<IFluidMountableView> instead */
        readonly IFluidMountableView?: IFluidMountableView;
     }
}
