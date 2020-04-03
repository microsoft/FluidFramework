/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

/**
 * Strong is a condensed version of Record specifically for IComponent
 */
export type Strong<K extends keyof IComponent> = {
    [P in K]: P;
};

/**
 * StrongOmitEmpty takes strong and simply Omits the requirement for providing
 * and empty string if we are using Empty.
 */
export type StrongOmitEmpty<K extends keyof IComponent> = Omit<Strong<K>, "">;

export type Module<T extends IComponent> =
    { [type in (keyof IComponent & keyof T)]: T[type] };

/**
 * Note: This is can also be represented as `Module<T> | undefined` but typescript
 * says it's too complex to represent so we have to duplicate some code.
 */
type OptionalModule<T extends IComponent> =
    { [type in (keyof IComponent & keyof T)]: T[type] | undefined };

/**
 * A Scope is a collection of optional and required modules.
 */
export type Scope<O extends IComponent, R extends IComponent = {}> = OptionalModule<O> & Module<R>;
