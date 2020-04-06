/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to a string representation
 * of that property.
 *
 * @example - { IComponentFoo: "IComponentFoo" }
 */
export type ComponentSymbolProvider<T extends IComponent> = {
    [P in (keyof T & keyof IComponent)]: P;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to an object that implements
 * the property.
 */
export type ComponentProvider<T extends IComponent> = {
    [P in (keyof T & keyof IComponent)]: T[P]
};

/**
 * Note: This is can also be represented as `ProvideComponent<T> | undefined` but typescript
 * says it's too complex to represent so we have to duplicate some code.
 */
export type OptionalComponentProvider<T extends IComponent> =
    { [type in (keyof T & keyof IComponent)]: T[type] | undefined };

/**
 * A Scope is a collection of optional and required providers.
 */
export type Scope<O extends IComponent, R extends IComponent = {}>
    = OptionalComponentProvider<O> & ComponentProvider<R>;
