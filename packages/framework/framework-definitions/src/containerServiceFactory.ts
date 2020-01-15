/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideContainerServiceFactory>> {
    }
}

export interface IProvideContainerServiceFactory {
    readonly IContainerServiceFactory: IContainerServiceFactory;
}

/**
 * Declaring that you are a container service
 */
export interface IContainerServiceFactory extends IProvideContainerServiceFactory {
    serviceId: string;
    getService(runtime: IHostRuntime): IComponent;
}
