/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "./components";

export interface IProvideComponentTakesScope {
    readonly IComponentTakesScope: IComponentTakesScope;
}

export interface IComponentTakesScope {
    setScope(scope: IComponent): void;
}
