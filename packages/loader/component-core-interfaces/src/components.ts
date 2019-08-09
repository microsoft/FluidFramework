/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentConfiguration,
    IComponentLoadable,
    IComponentRunnable,
} from "./componentLoadable";
import { IComponentHTMLRender, IComponentHTMLVisual } from "./componentRender";
import { IComponentRouter } from "./componentRouter";
import { IComponentHandle, IComponentHandleContext } from "./handles";
import { IComponentQueryableLegacy } from "./legacy";
import { IComponentSerializer } from "./serializer";

export interface IComponent {
    readonly IComponentLoadable?: IComponentLoadable;
    readonly IComponentRunnable?: IComponentRunnable;
    readonly IComponentRouter?: IComponentRouter;
    readonly IComponentHTMLRender?: IComponentHTMLRender;
    readonly IComponentHTMLVisual?: IComponentHTMLVisual;
    readonly IComponentQueryableLegacy?: IComponentQueryableLegacy;
    readonly IComponentConfiguration?: IComponentConfiguration;
    readonly IComponentHandleContext?: IComponentHandleContext;
    readonly IComponentHandle?: IComponentHandle;
    readonly IComponentSerializer?: IComponentSerializer;
}
