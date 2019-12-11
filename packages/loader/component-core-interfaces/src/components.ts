/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideComponentConfiguration,
    IProvideComponentLoadable,
    IProvideComponentRunnable,
} from "./componentLoadable";
import { IProvideComponentHTMLVisual, IProvideComponentHTMLView } from "./componentRender";
import { IProvideComponentRouter } from "./componentRouter";
import { IProvideComponentHandle, IProvideComponentHandleContext } from "./handles";
import { IProvideComponentSerializer } from "./serializer";

export interface IComponent extends
    Readonly<Partial<
        IProvideComponentHTMLVisual
        & IProvideComponentHTMLView
        & IProvideComponentLoadable
        & IProvideComponentRunnable
        & IProvideComponentRouter
        & IProvideComponentHandleContext
        & IProvideComponentConfiguration
        & IProvideComponentHandle
        & IProvideComponentSerializer>> {
}
