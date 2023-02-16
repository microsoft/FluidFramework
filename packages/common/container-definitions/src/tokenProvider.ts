/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @deprecated 2.0.0-internal.3.2.0 Fluid Framework does not prescribe a particular approach to token providers.
 */
export const IFluidTokenProvider: keyof IProvideFluidTokenProvider = "IFluidTokenProvider";

/**
 * @deprecated 2.0.0-internal.3.2.0 Fluid Framework does not prescribe a particular approach to token providers.
 */
export interface IProvideFluidTokenProvider {
	readonly IFluidTokenProvider: IFluidTokenProvider;
}

/**
 * @deprecated 2.0.0-internal.3.2.0 Fluid Framework does not prescribe a particular approach to token providers.
 */
export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
	intelligence: { [service: string]: any };
}
