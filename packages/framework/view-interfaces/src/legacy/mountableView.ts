/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IFluidObject } from "@fluidframework/component-core-interfaces";

export const IComponentMountableView: keyof IProvideComponentMountableView = "IComponentMountableView";

export interface IProvideComponentMountableView {
    readonly IComponentMountableView: IComponentMountableView;
}

/**
 * IComponentMountableViewClass defines the statics on our class implementing IComponentMountableView.
 */
export interface IComponentMountableViewClass {
    /**
     * @param view - The view to make mountable
     */
    new(view: IComponent & IFluidObject): IComponentMountableView;
    /**
     * Test whether the given view can be successfully mounted by a MountableView.
     * @param view - the view to test if it can be mounted.
     */
    canMount(view: IComponent & IFluidObject): boolean;
}

/**
 * An IComponentMountableView provides a view bundled with a mounting mechanism.  That view can be mounted and
 * unmounted from a given element.  This bundling of view + mounting mechanism is important for React, which
 * needs the same React instance to be used for the mounting ReactDOM.render() call as the component it's mounting,
 * or else React hooks don't work.  This is the case in scenarios like webpack-component-loader, which attempts
 * to do cross-bundle mounting.
 *
 * This is not intended to be used as a general rendering/mounting approach, but rather as just a specific solution
 * for cross-bundle mounting.  General rendering/mounting should instead use the view adapters or make direct calls
 * to framework-specific rendering APIs.
 */
export interface IComponentMountableView extends IProvideComponentMountableView {
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

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentMountableView>> { }
}
