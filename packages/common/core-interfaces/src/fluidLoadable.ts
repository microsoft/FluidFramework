/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "./handles.js";

/**
 * @public
 */
export const IFluidLoadable: keyof IProvideFluidLoadable = "IFluidLoadable";

/**
 * @public
 */
export interface IProvideFluidLoadable {
	readonly IFluidLoadable: IFluidLoadable;
}
/**
 * A shared FluidObject has a URL from which it can be referenced
 * @sealed @public
 */
export interface IFluidLoadable extends IProvideFluidLoadable {
	// Handle to the loadable FluidObject
	readonly handle: IFluidHandle;
}

/**
 * @internal
 */
export const IFluidRunnable: keyof IProvideFluidRunnable = "IFluidRunnable";

/**
 * @internal
 */
export interface IProvideFluidRunnable {
	readonly IFluidRunnable: IFluidRunnable;
}
/**
 * @internal
 */
export interface IFluidRunnable {
	// TODO: Use `unknown` instead (API-Breaking)

	run(...args: any[]): Promise<void>;
	stop(reason?: string): void;
}
