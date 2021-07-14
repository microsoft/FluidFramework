/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideRuntimeFactory } from "../runtime";

export const IFluidTokenProvider: keyof IProvideFluidTokenProvider = "IFluidTokenProvider";

export interface IProvideFluidTokenProvider {
    readonly IFluidTokenProvider: IFluidTokenProvider;
}

export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
    intelligence: { [service: string]: any };
}

declare module "@fluidframework/core-interfaces" {
    /* eslint-disable @typescript-eslint/no-empty-interface */
    export interface IFluidObject extends Readonly<Partial<
        IProvideRuntimeFactory &
        IProvideFluidTokenProvider>> { }
    /* eslint-enable @typescript-eslint/no-empty-interface */
}
