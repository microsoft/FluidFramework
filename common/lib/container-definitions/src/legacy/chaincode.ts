/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRuntimeFactory } from "../runtime";

export const IFluidTokenProvider: keyof IProvideFluidTokenProvider = "IFluidTokenProvider";

export interface IProvideFluidTokenProvider {
    readonly IFluidTokenProvider: IFluidTokenProvider;
}

export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
    intelligence: { [service: string]: any };
}

declare module "@fluidframework/core-interfaces" {
    export interface IFluidObject  {
        /** @deprecated - use `FluidObject<IRuntimeFactory>` instead */
        readonly IRuntimeFactory?: IRuntimeFactory;
        /** @deprecated - use `FluidObject<IFluidTokenProvider>` instead */
        readonly IFluidTokenProvider?: IFluidTokenProvider;
    }
}
