/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideComponentLoadable } from "./componentLoadable";
import { IProvideComponentRouter } from "./componentRouter";
import { IProvideComponentSerializer } from "./serializer";
import { IComponentHandleContext, IComponentHandle } from "./handles";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<
        IProvideComponentLoadable
        & IProvideComponentRouter
        & IProvideComponentSerializer
        & IComponentHandleContext
        & IComponentHandle
    >> { }
}
