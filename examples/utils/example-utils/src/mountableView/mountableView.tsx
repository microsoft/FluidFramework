/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

import { IFluidMountableView } from "./interface.js";

/**
 * Abstracts mounting of views for usage outside of their bundle.  Supports React elements.
 *
 * The MountableView must be applied from within the same bundle that provides the view, and then that MountableView
 * can be used by a separate bundle.  Attempting to apply a MountableView to a view that was retrieved from a separate
 * bundle is not supported.
 * @internal
 */
export class MountableView implements IFluidMountableView {
	/**
	 * {@inheritDoc IProvideFluidMountableView.IFluidMountableView}
	 */
	public get IFluidMountableView(): MountableView {
		return this;
	}

	/**
	 * Test whether the given view can be successfully mounted by a MountableView.
	 * @param view - the view to test if it can be mounted.
	 */
	public static canMount(view: FluidObject): boolean {
		return React.isValidElement(view);
	}

	/**
	 * A reference to the current container node for this view so we can do DOM cleanup.
	 * This also doubles as a way for us to know if we are mounted or not.
	 */
	private containerElement: HTMLElement | undefined;

	/**
	 * If the viewProvider is a React component we will retain a reference to the React component across
	 * rendering/removal.
	 */
	private reactView: JSX.Element | undefined;

	private readonly view: FluidObject;

	/**
	 * @param view - The view to make mountable
	 */
	constructor(view: FluidObject) {
		if (!MountableView.canMount(view)) {
			throw new Error("Unmountable view type");
		}
		this.view = view;
	}

	/**
	 * {@inheritDoc IFluidMountableView.mount}
	 */
	public mount(container: HTMLElement): void {
		if (this.containerElement !== undefined) {
			throw new Error("Already mounted");
		}

		this.containerElement = container;

		// Try to get a React view if we don't have one already.
		if (this.reactView === undefined && React.isValidElement(this.view)) {
			this.reactView = this.view;
		}
		// Render with React if possible.
		if (this.reactView !== undefined) {
			// TODO: Remove rule disable once we move to the React 18 APIs.
			// eslint-disable-next-line import/no-deprecated -- AB#18875
			ReactDOM.render(this.reactView, this.containerElement);
			return;
		}

		// Should be unreachable -- we should have blown up in the constructor.
		throw new Error("Failed to mount");
	}

	/**
	 * {@inheritDoc IFluidMountableView.unmount}
	 */
	public unmount(): void {
		// Do nothing if we are already unmounted.
		if (this.containerElement === undefined) {
			return;
		}

		// Call appropriate cleanup methods on the view and then remove it from the DOM.
		if (this.reactView !== undefined) {
			// TODO: Remove rule disable once we move to the React 18 APIs.
			// eslint-disable-next-line import/no-deprecated -- AB#18875
			ReactDOM.unmountComponentAtNode(this.containerElement);
		}

		this.containerElement = undefined;
	}
}
