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
 * This type defines that the object has a constructor that will return a IFluidLoadable
 */
export type LoadableObjectCtor<T extends IFluidLoadable> = new(...args: any[]) => T;

export interface ContainerConfig<T extends string = string> {
    name: T;
    /**
     * initialDataObjects defines dataObjects that will be created when the Container
     * is first created. It uses the key as the id and the value and the DataObject to create.
     *
     * In the example below two DataObjects will be created when the Container is first
     * created. One with id "foo1" that will return a `Foo` DataObject and the other with
     * id "bar2" that will return a `Bar` DataObject.
     *
     * ```
     * {
     *   foo1: Foo,
     *   bar2: Bar,
     * }
     * ```
     *
     * To get these DataObjects, call `container.getDataObject` passing in one of the ids.
     */
    initialObjects: LoadableObjectClassRecord;

    /**
     * Dynamic objects are FluidObjects that can be created after the initial container creation.
     */
    dynamicObjectTypes?: LoadableObjectClass<any>[];
}
