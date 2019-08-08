/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable, IComponentRunnable } from "./componentLoadable";
import { IComponentHTMLRender, IComponentHTMLVisual } from "./componentRender";
import { IComponentRouter } from "./componentRouter";

export interface IComponent {
    readonly IComponentLoadable?: IComponentLoadable;
    readonly IComponentRunnable?: IComponentRunnable;
    readonly IComponentRouter?: IComponentRouter;
    readonly IComponentHTMLRender?: IComponentHTMLRender;
    readonly IComponentHTMLVisual?: IComponentHTMLVisual;
}
