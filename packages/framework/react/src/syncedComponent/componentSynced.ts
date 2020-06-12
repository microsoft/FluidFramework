/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentSynced>> { }
}

export const IComponentSynced: keyof IProvideComponentSynced = "IComponentSynced";

export interface IProvideComponentSynced {
    readonly IComponentSynced: IComponentSynced;
}

/**
 * Provides functionality to retrieve subsets of an internal registry.
 */
export interface IComponentSynced extends IProvideComponentSynced {
    syncedState: ISharedMap;
}
