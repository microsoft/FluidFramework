/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "./handles";

export const IFluidLoadable: keyof IProvideFluidLoadable = "IFluidLoadable";

export interface IProvideFluidLoadable {
    readonly IFluidLoadable: IFluidLoadable;
}
/**
 * A shared FluidObject has a URL from which it can be referenced
 */
export interface IFluidLoadable extends IProvideFluidLoadable {
    // Handle to the loadable FluidObject
    handle: IFluidHandle;
}

export const IFluidRunnable: keyof IProvideFluidRunnable = "IFluidRunnable";

export interface IProvideFluidRunnable {
    readonly IFluidRunnable: IFluidRunnable;
}
export interface IFluidRunnable {
    run(...args: any[]): Promise<void>;
    stop(reason?: string): void;
}
