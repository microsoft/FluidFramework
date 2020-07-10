/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideMessageScheduler } from "../messageScheduler";
import { IProvideRuntimeFactory } from "../runtime";

export const IComponentTokenProvider: keyof IProvideComponentTokenProvider = "IComponentTokenProvider";

export interface IProvideComponentTokenProvider {
    readonly IComponentTokenProvider: IComponentTokenProvider;
}

export interface IComponentTokenProvider extends IProvideComponentTokenProvider {
    intelligence: { [service: string]: any };
}

declare module "@fluidframework/component-core-interfaces" {
    /* eslint-disable @typescript-eslint/no-empty-interface */
    export interface IComponent extends Readonly<Partial<
        IProvideRuntimeFactory &
        IProvideComponentTokenProvider &
        IProvideMessageScheduler>> { }
/* eslint-enable @typescript-eslint/no-empty-interface */
}
