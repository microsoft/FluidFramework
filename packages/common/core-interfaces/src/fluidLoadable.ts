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
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IProvideFluidLoadable {
	readonly IFluidLoadable: IFluidLoadable;
}
/**
 * A shared FluidObject has a URL from which it can be referenced
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
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
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IProvideFluidRunnable {
	readonly IFluidRunnable: IFluidRunnable;
}
/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IFluidRunnable {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run(...args: any[]): Promise<void>;
	stop(reason?: string): void;
}
