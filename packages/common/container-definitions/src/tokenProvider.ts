/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const IFluidTokenProvider: keyof IProvideFluidTokenProvider = "IFluidTokenProvider";

export interface IProvideFluidTokenProvider {
    readonly IFluidTokenProvider: IFluidTokenProvider;
}

export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
    intelligence: { [service: string]: any; };
}
