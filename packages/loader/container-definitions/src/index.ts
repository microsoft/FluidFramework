/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideRuntimeFactory } from "./runtime";
import { IProvideFluidTokenProvider } from "./tokenProvider";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<
        IProvideRuntimeFactory &
        IProvideFluidTokenProvider>> { }
}

export * from "./audience";
export * from "./browserPackage";
export * from "./legacy/chaincode";
export * from "./deltas";
export * from "./error";
export * from "./loader";
export * from "./fluidPackage";
export * from "./fluidModule";
export * from "./proxyLoader";
export * from "./runtime";
