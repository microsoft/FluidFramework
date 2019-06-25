/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { SharedDirectory } from "./directory";
import { ISharedDirectory, ISharedMap, IValueType } from "./interfaces";
import { SharedMap } from "./map";

// register default types
const defaultValueTypes = new Array<IValueType<any>>();
export function registerDefaultValueType(type: IValueType<any>) {
    defaultValueTypes.push(type);
}

/**
 * The extension that defines the map
 */
export class MapExtension implements ISharedObjectExtension {
    public static readonly Type = "https://graph.microsoft.com/types/map";

    public readonly type: string = MapExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedMap> {

        const map = new SharedMap(id, runtime, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        await map.load(minimumSequenceNumber, headerOrigin, services);

        return map;
    }

    public create(document: IComponentRuntime, id: string): ISharedMap {
        const map = new SharedMap(id, document, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        map.initializeLocal();

        return map;
    }

    private registerValueTypes(map: SharedMap, valueTypes: Array<IValueType<any>>) {
        for (const type of valueTypes) {
            map.registerValueType(type);
        }
    }
}

/**
 * The extension that defines the directory
 */
export class DirectoryExtension {
    public static readonly Type = "https://graph.microsoft.com/types/directory";

    public readonly type: string = DirectoryExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedDirectory> {

        const directory = new SharedDirectory(id, runtime, DirectoryExtension.Type);
        this.registerValueTypes(directory, defaultValueTypes);
        await directory.load(minimumSequenceNumber, headerOrigin, services);

        return directory;
    }

    public create(document: IComponentRuntime, id: string): ISharedDirectory {
        const directory = new SharedDirectory(id, document, DirectoryExtension.Type);
        this.registerValueTypes(directory, defaultValueTypes);
        directory.initializeLocal();

        return directory;
    }

    private registerValueTypes(directory: SharedDirectory, valueTypes: Array<IValueType<any>>) {
        for (const type of valueTypes) {
            directory.registerValueType(type);
        }
    }
}
