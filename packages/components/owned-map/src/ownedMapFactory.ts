/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueType } from "@prague/map";
import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { OwnedSharedMap } from "./ownedMap";

/**
 * The factory that defines the map
 */
export class OwnedMapFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/ownedmap";

    public static Attributes: IChannelAttributes = {
        type: OwnedMapFactory.Type,
        snapshotFormatVersion: "0.1",
    };

    public get type() {
        return OwnedMapFactory.Type;
    }

    public get attributes() {
        return OwnedMapFactory.Attributes;
    }

    constructor(private readonly defaultValueTypes: Array<IValueType<any>> = []) {
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedMap> {

        const map = new OwnedSharedMap(id, runtime, OwnedMapFactory.Attributes);
        this.registerValueTypes(map);
        await map.load(branchId, services);

        return map;
    }

    public create(document: IComponentRuntime, id: string): ISharedMap {
        const map = new OwnedSharedMap(id, document, OwnedMapFactory.Attributes);
        this.registerValueTypes(map);
        map.initializeLocal();

        return map;
    }

    private registerValueTypes(map: OwnedSharedMap) {
        for (const type of this.defaultValueTypes) {
            map.registerValueType(type);
        }
    }
}
