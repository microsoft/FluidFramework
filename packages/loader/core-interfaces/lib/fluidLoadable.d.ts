/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandle } from "./handles";
export declare const IFluidLoadable: keyof IProvideFluidLoadable;
export interface IProvideFluidLoadable {
    readonly IFluidLoadable: IFluidLoadable;
}
/**
 * A shared FluidObject has a URL from which it can be referenced
 */
export interface IFluidLoadable extends IProvideFluidLoadable {
    handle: IFluidHandle;
}
export declare const IFluidRunnable: keyof IProvideFluidRunnable;
export interface IProvideFluidRunnable {
    readonly IFluidRunnable: IFluidRunnable;
}
export interface IFluidRunnable {
    run(...args: any[]): Promise<void>;
    stop(reason?: string): void;
}
export declare const IFluidConfiguration: keyof IProvideFluidConfiguration;
export interface IProvideFluidConfiguration {
    readonly IFluidConfiguration: IFluidConfiguration;
}
export interface IFluidConfiguration extends IProvideFluidConfiguration {
    scopes: string[];
}
//# sourceMappingURL=fluidLoadable.d.ts.map