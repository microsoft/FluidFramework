/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IProvideRuntimeFactory } from "../runtime";
export declare const IFluidTokenProvider: keyof IProvideFluidTokenProvider;
export interface IProvideFluidTokenProvider {
    readonly IFluidTokenProvider: IFluidTokenProvider;
}
export interface IFluidTokenProvider extends IProvideFluidTokenProvider {
    intelligence: {
        [service: string]: any;
    };
}
declare module "@fluidframework/core-interfaces" {
    interface IFluidObject extends Readonly<Partial<IProvideRuntimeFactory & IProvideFluidTokenProvider>> {
    }
}
//# sourceMappingURL=chaincode.d.ts.map