/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseProperty, ContainerProperty, ValueProperty, ValueArrayProperty,
    ValueMapProperty, MapProperty, ArrayProperty, SetProperty, ReferenceProperty,
    ReferenceArrayProperty, ReferenceMapProperty,
} from "@fluid-experimental/property-properties";

export abstract class ProxifiedPropertyValueArray {
    public abstract getProperty(): ValueArrayProperty;
    public abstract swap(index0: number, index1: number);
}
export abstract class BaseProxifiedProperty<T = BaseProperty> {
    public abstract getProperty(input?: any): T;
}
export abstract class ProxifiedArrayProperty extends Array {
    public abstract getProperty(): ArrayProperty;
    public abstract swap(index0: number, index1: number);
}
export abstract class ProxifiedSetProperty extends Set { public abstract getProperty(): BaseProperty; }
export abstract class ProxifiedMapProperty extends Map { public abstract getProperty(): MapProperty; }
export type GenericProxify<TProperty> = {
    [P in keyof TProperty]: ProxyType<TProperty[P]>;
};

export type ProxyType<TProperty> =
    TProperty extends ContainerProperty ? (BaseProxifiedProperty<ContainerProperty> & { [key: string]: any; }) :
    TProperty extends ValueProperty ? number | boolean | string | Record<string, unknown> :
    TProperty extends ValueArrayProperty ?
    (ProxifiedPropertyValueArray & (number[] | boolean[] | string[] | Record<string, unknown>[])) :
    TProperty extends ValueMapProperty ? (BaseProxifiedProperty &
        (Map<string, number | boolean | string | Record<string, unknown>>)) :
    TProperty extends MapProperty ? ProxifiedMapProperty :
    TProperty extends ArrayProperty ? ProxifiedArrayProperty :
    TProperty extends SetProperty ? ProxifiedSetProperty :
    GenericProxify<TProperty>;

export type CollectionTypes = ValueArrayProperty | ArrayProperty | MapProperty | ValueMapProperty | SetProperty;
export type PrimitiveTypes = ValueProperty;
export type PropertyTypes = BaseProperty |
    ContainerProperty | PrimitiveTypes | CollectionTypes;
export type NonPrimitiveTypes =
    ContainerProperty | CollectionTypes;

export type ReferenceType = ReferenceProperty | ReferenceArrayProperty | ReferenceMapProperty;
