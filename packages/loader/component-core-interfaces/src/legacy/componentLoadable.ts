/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export const IComponentRunnable: keyof IProvideComponentRunnable = "IComponentRunnable";

export interface IProvideComponentRunnable {
    readonly IComponentRunnable: IComponentRunnable;
}
export interface IComponentRunnable {
    run(...args: any[]): Promise<void>;
    stop(reason?: string): void;
}

export const IComponentConfiguration: keyof IProvideComponentConfiguration = "IComponentConfiguration";

export interface IProvideComponentConfiguration {
    readonly IComponentConfiguration: IComponentConfiguration;
}

export interface IComponentConfiguration extends IProvideComponentConfiguration {
    canReconnect: boolean;
    scopes: string[];
}
