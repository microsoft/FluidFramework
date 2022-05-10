/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRuntimeFactory } from "../runtime";

/**
 * @deprecated - This will be removed in a later release.
 */
export const IFluidTokenProvider: keyof IProvideFluidTokenProvider = "IFluidTokenProvider";

/**
 * @deprecated - This will be removed in a later release.
 */
export interface IProvideFluidTokenProvider {
    readonly IFluidTokenProvider: IFluidTokenProvider;
}

/**
 * @deprecated - This will be removed in a later release.
 */
export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
    intelligence: { [service: string]: any; };
}

declare module "@fluidframework/core-interfaces" {
    export interface IFluidObject {
        /** @deprecated - use `FluidObject<IRuntimeFactory>` instead */
        readonly IRuntimeFactory?: IRuntimeFactory;
        /** @deprecated - use `FluidObject<IFluidTokenProvider>` instead */
        readonly IFluidTokenProvider?: IFluidTokenProvider;
    }
}
