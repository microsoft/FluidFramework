/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export declare const IFluidTokenProvider: keyof IProvideFluidTokenProvider;
export interface IProvideFluidTokenProvider {
    readonly IFluidTokenProvider: IFluidTokenProvider;
}
export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
    intelligence: {
        [service: string]: any;
    };
}
//# sourceMappingURL=tokenProvider.d.ts.map