/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideContainerService>> {
    }
}

export interface IProvideContainerService {
    readonly IContainerService: IContainerService;
}

/**
 * Declaring that you are a container service
 */
export interface IContainerService extends IProvideContainerService {
    serviceId: string;
}
