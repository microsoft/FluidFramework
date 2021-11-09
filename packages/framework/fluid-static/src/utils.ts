/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import {
    ContainerSchema,
    DataObjectClass,
    LoadableObjectClass,
    SharedObjectClass,
} from "./types";

/**
 * Runtime check to determine if a class is a DataObject type
 */
export const isDataObjectClass = (obj: any): obj is DataObjectClass<any> => {
    return obj?.factory !== undefined;
};

/**
 * Runtime check to determine if a class is a SharedObject type
 */
export const isSharedObjectClass = (obj: any): obj is SharedObjectClass<any> => {
    return obj?.getFactory !== undefined;
};

/**
 * The ContainerSchema consists of initialObjects and dynamicObjectTypes. These types can be
 * of both SharedObject or DataObject. This function seperates the two and returns a registery
 * of DataObject types and an array of SharedObjects.
 */
export const parseDataObjectsFromSharedObjects = (schema: ContainerSchema):
    [NamedFluidDataStoreRegistryEntry[], IChannelFactory[]] => {
    const registryEntries: Set<NamedFluidDataStoreRegistryEntry> = new Set();
    const sharedObjects: Set<IChannelFactory> = new Set();

    const tryAddObject = (obj: LoadableObjectClass<any>) => {
        if (isSharedObjectClass(obj)) {
            sharedObjects.add(obj.getFactory());
        } else if (isDataObjectClass(obj)) {
            registryEntries.add([obj.factory.type, Promise.resolve(obj.factory)]);
        } else {
            throw new Error(`Entry is neither a DataObject or a SharedObject`);
        }
    };

    // Add the object types that will be initialized
    Object.values(schema.initialObjects).forEach((obj) => {
        tryAddObject(obj);
    });

    // If there are dynamic object types we will add them now
    if (schema.dynamicObjectTypes) {
        for (const obj of schema.dynamicObjectTypes) {
            tryAddObject(obj);
        }
    }

    if (registryEntries.size === 0 && sharedObjects.size === 0) {
        throw new Error("Container cannot be initialized without any DataTypes");
    }

    return [Array.from(registryEntries), Array.from(sharedObjects)];
};
