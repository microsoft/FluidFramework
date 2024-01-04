/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "./handles";

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
 * @public
 */
export interface IFluidLoadable extends IProvideFluidLoadable {
	// Handle to the loadable FluidObject
	handle: IFluidHandle;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run(...args: any[]): Promise<void>;
	stop(reason?: string): void;
}
