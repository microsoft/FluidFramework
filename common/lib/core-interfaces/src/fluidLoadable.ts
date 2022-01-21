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

/**
 * @deprecated 0.42 - Not recommended for use and will be removed in an upcoming release.
 */
export const IFluidConfiguration: keyof IProvideFluidConfiguration = "IFluidConfiguration";

/**
 * @deprecated 0.42 - Not recommended for use and will be removed in an upcoming release.
 */
export interface IProvideFluidConfiguration {
    /**
     * @deprecated 0.42 - Not recommended for use and will be removed in an upcoming release.
     */
    readonly IFluidConfiguration: IFluidConfiguration;
}

/**
 * @deprecated 0.42 - Not recommended for use and will be removed in an upcoming release.
 */
export interface IFluidConfiguration extends IProvideFluidConfiguration {
    /**
     * @deprecated 0.42 - Not recommended for use and will be removed in an upcoming release.
     */
    scopes: string[];
}
