/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponentHandle } from "./handles";
export declare const IComponentLoadable: keyof IProvideComponentLoadable;
export interface IProvideComponentLoadable {
    readonly IComponentLoadable: IComponentLoadable;
}
/**
 * A shared component has a URL from which it can be referenced
 */
export interface IComponentLoadable extends IProvideComponentLoadable {
    readonly url: string;
    handle: IComponentHandle;
}
export declare const IComponentRunnable: keyof IProvideComponentRunnable;
export interface IProvideComponentRunnable {
    readonly IComponentRunnable: IComponentRunnable;
}
export interface IComponentRunnable {
    run(...args: any[]): Promise<void>;
    stop(reason?: string): void;
}
export declare const IComponentConfiguration: keyof IProvideComponentConfiguration;
export interface IProvideComponentConfiguration {
    readonly IComponentConfiguration: IComponentConfiguration;
}
export interface IComponentConfiguration extends IProvideComponentConfiguration {
    canReconnect: boolean;
    scopes: string[];
}
//# sourceMappingURL=componentLoadable.d.ts.map