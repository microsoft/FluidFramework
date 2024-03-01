/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Provider for a mountable view for use with the FluidObject pattern.
 * @internal
 */
export interface IProvideFluidMountableView {
	/**
	 * The provided mountable view.
	 */
	readonly IFluidMountableView: IFluidMountableView;
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
 * @internal
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
