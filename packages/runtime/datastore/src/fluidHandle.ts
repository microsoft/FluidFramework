/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import {
	generateHandleContextPath,
	FluidHandleBase,
} from "@fluidframework/runtime-utils/internal";

/**
 * Handle for a shared {@link @fluidframework/core-interfaces#FluidObject}.
 * @legacy
 * @alpha
 */
export class FluidObjectHandle<
	T extends FluidObject = FluidObject,
> extends FluidHandleBase<T> {
	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.absolutePath}
	 */
	public readonly absolutePath: string;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.isAttached}
	 */
	public get isAttached(): boolean {
		return this.routeContext.isAttached;
	}

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
		super();
		this.absolutePath = generateHandleContextPath(path, this.routeContext);
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.get}
	 */
	// TODO: Return `Promise<T>` instead of `Promise<any>`.
	// This was clearly the intended typing of this API, but fixing it would be a breaking change.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async get(): Promise<any> {
		// Note that this return works whether we received a T or a Promise<T> for this.value in the constructor.
		return this.value;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IFluidHandle.attachGraph }
	 */
	public attachGraph(): void {
		this.routeContext.attachGraph();
	}
}
