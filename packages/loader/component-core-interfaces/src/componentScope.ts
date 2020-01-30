/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "./components";

export interface IProvideComponentTakesScope {
    readonly IComponentTakesScope: IComponentTakesScope;
}

/**
 * "Scope" is some IComponent that perhaps might hold things that this taker component can use.
 * The component taking the scope will probably query interfaces on the passed scope to determine if
 * it has something it can use.  Check out the Math component for an example of this.
 */
export interface IComponentTakesScope {
    setScope(scope: IComponent): void;
}
