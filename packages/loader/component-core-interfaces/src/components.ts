/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideComponentConfiguration,
    IProvideComponentLoadable,
    IProvideComponentRunnable,
} from "./componentLoadable";
import { IProvideComponentHTMLView, IProvideComponentHTMLVisual } from "./componentRender";
import { IProvideComponentCallable } from "./componentCallable";
import { IProvideComponentRouter } from "./componentRouter";
import { IProvideComponentHandle, IProvideComponentHandleContext } from "./handles";
import { IProvideComponentSerializer } from "./serializer";

/* eslint-disable @typescript-eslint/no-empty-interface, @typescript-eslint/indent */
export interface IComponent extends
    Readonly<Partial<
        IProvideComponentHTMLView
        & IProvideComponentHTMLVisual
        & IProvideComponentCallable
        & IProvideComponentLoadable
        & IProvideComponentRunnable
        & IProvideComponentRouter
        & IProvideComponentHandleContext
        & IProvideComponentConfiguration
        & IProvideComponentHandle
        & IProvideComponentSerializer>> {
}
/* eslint-enable @typescript-eslint/no-empty-interface, @typescript-eslint/indent */
