/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideComponentConfiguration,
    IProvideComponentLoadable,
    IProvideComponentRunnable,
} from "./componentLoadable";
import { IProvideComponentHTMLVisual } from "./componentRender";
import { IProvideComponentRouter } from "./componentRouter";
import { IProvideComponentHandle, IProvideComponentHandleContext } from "./handles";
import { IComponentQueryableLegacy } from "./legacy";
import { IProvideComponentSerializer } from "./serializer";

export interface IComponent extends
    Readonly<Partial<
        IProvideComponentHTMLVisual
        & IProvideComponentLoadable
        & IProvideComponentRunnable
        & IProvideComponentRouter
        & IProvideComponentHandleContext
        & IProvideComponentConfiguration
        & IProvideComponentHandle
        & IProvideComponentSerializer>> {

    readonly IComponentQueryableLegacy?: IComponentQueryableLegacy;
}
