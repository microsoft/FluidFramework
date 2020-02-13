/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistryDetails>> { }
}

export interface IProvideComponentRegistryDetails {
    readonly IComponentRegistryDetails: Map<string, Promise<IProvideComponentFactory>>;
}