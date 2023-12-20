/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext, FluidObject } from "@fluidframework/core-interfaces";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

/**
 * Handle for a shared {@link @fluidframework/core-interfaces#FluidObject}.
 * @alpha
 */
export class FluidObjectHandle<T extends FluidObject = FluidObject> implements IFluidHandle {
	private readonly pendingHandlesToMakeVisible: Set<IFluidHandle> = new Set();

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.absolutePath}
	 */
	public readonly absolutePath: string;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IProvideFluidHandle.IFluidHandle}
	 */
	public get IFluidHandle(): IFluidHandle {
		return this;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.isAttached}
	 */
	public get isAttached(): boolean {
		return this.routeContext.isAttached;
	}

	/**
	 * Tells whether the object of this handle is visible in the container locally or globally.
	 */
	private get visible(): boolean {
		/**
		 * If the object of this handle is attached, it is visible in the container. Ideally, checking local visibility
		 * should be enough for a handle. However, there are scenarios where the object becomes locally visible but the
		 * handle does not know this - This will happen is attachGraph is never called on the handle. Couple of examples
		 * where this can happen:
		 *
		 * 1. Handles to DDS other than the default handle won't know if the DDS becomes visible after the handle was
		 * created.
		 *
		 * 2. Handles to root data stores will never know that it was visible because the handle will not be stores in
		 * another DDS and so, attachGraph will never be called on it.
		 */
		return this.isAttached || this.locallyVisible;
	}

	/**
	 * Tracks whether this handle is locally visible in the container.
	 */
	private locallyVisible: boolean = false;

	/**
	 * Creates a new `FluidObjectHandle`.
	 *
	 * @param value - The {@link @fluidframework/core-interfaces#FluidObject} object this handle is for.
	 * @param path - The path to this handle relative to the `routeContext`.
	 * @param routeContext - The parent {@link @fluidframework/core-interfaces#IFluidHandleContext} that has a route
	 * to this handle.
	 */
	constructor(
		protected readonly value: T | Promise<T>,
		public readonly path: string,
		public readonly routeContext: IFluidHandleContext,
	) {
		this.absolutePath = generateHandleContextPath(path, this.routeContext);
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.get}
	 */
	public async get(): Promise<any> {
		// Note that this return works whether we received a T or a Promise<T> for this.value in the constructor.
		return this.value;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.attachGraph }
	 */
	public attachGraph(): void {
		if (this.visible) {
			return;
		}

		this.locallyVisible = true;
		this.pendingHandlesToMakeVisible.forEach((handle) => {
			handle.attachGraph();
		});
		this.pendingHandlesToMakeVisible.clear();
		this.routeContext.attachGraph();
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.bind}
	 */
	public bind(handle: IFluidHandle) {
		// If this handle is visible, attach the graph of the incoming handle as well.
		if (this.visible) {
			handle.attachGraph();
			return;
		}
		this.pendingHandlesToMakeVisible.add(handle);
	}
}
