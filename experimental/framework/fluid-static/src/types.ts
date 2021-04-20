/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

export type LoadableObjectRecord = Record<string, IFluidLoadable>;

export type LoadableObjectClassRecord = Record<string, LoadableObjectClass<any>>;

/**
 * A LoadableObjectClass is an class object of DataObject or SharedObject
 */
export type LoadableObjectClass<T extends IFluidLoadable> = DataObjectClass<T> | SharedObjectClass<T>;

/**
 * A DataObjectClass is a class that has a factory that can create a DataObject and a
 * contructor that will return the type of the DataObject.
 */
export type DataObjectClass<T extends IFluidLoadable>
    = { readonly factory: IFluidDataStoreFactory }  & LoadableObjectCtor<T>;

/**
 * A SharedObjectClass is a class that has a factory that can create a DDS (SharedObject) and a
 * contructor that will return the type of the DataObject.
 */
export type SharedObjectClass<T extends IFluidLoadable>
    = { readonly getFactory: () => IChannelFactory } & LoadableObjectCtor<T>;

/**
 * An object with a constructor that will return an `IFluidLoadable`.
 */
export type LoadableObjectCtor<T extends IFluidLoadable> = new(...args: any[]) => T;

export interface ContainerSchema {
    /**
     * Name of the container being defined.
     *
     * This property is not currently used by Fluid but instead provides the developer a centralized
     * location to name their container. It is useful in multi-container scenarios.
     */
    name: string;

    /**
     * initialObjects defines loadable objects that will be created when the Container
     * is first created. It uses the key as the id and the value as the loadable object to create.
     *
     * In the example below two objects will be created when the Container is first
     * created. One with id "map1" that will return a `SharedMap` and the other with
     * id "pair1" that will return a `KeyValueDataObject`.
     *
     * ```
     * {
     *   map1: SharedMap,
     *   pair1: KeyValueDataObject,
     * }
     * ```
     */
    initialObjects: LoadableObjectClassRecord;

    /**
     * Dynamic objects are Loadable objects that can be created after the initial Container creation.
     *
     * Types defined in `initialObjects` will always be available and are not required to be provided here.
     *
     * For best practice it's recommended to define all the dynamic types you create even if they are
     * included via initialObjects.
     */
    dynamicObjectTypes?: LoadableObjectClass<any>[];
}
