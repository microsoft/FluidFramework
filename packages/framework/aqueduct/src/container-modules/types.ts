/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

type OptionalModule<T extends IComponent> =
    { [type in (keyof IComponent & keyof T)]: T[type] | undefined };

export type Module<T extends IComponent> =
    { [type in (keyof IComponent & keyof T)]: T[type] };

/**
 * A Scope is a collection of optional and required modules.
 */
export type Scope<O extends IComponent, R extends IComponent = {}> = OptionalModule<O> & Module<R>;
