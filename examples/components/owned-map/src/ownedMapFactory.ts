/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@microsoft/fluid-map";
import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { OwnedSharedMap } from "./ownedMap";

/**
 * The factory that defines the map
 */
export class OwnedMapFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/ownedmap";

    public static readonly Attributes: IChannelAttributes = {
        type: OwnedMapFactory.Type,
        snapshotFormatVersion: "0.1",
    };

    public get type() {
        return OwnedMapFactory.Type;
    }

    public get attributes() {
        return OwnedMapFactory.Attributes;
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedMap> {
        const map = new OwnedSharedMap(id, runtime, attributes);
        await map.load(branchId, services);

        return map;
    }

    public create(document: IComponentRuntime, id: string): ISharedMap {
        const map = new OwnedSharedMap(id, document, OwnedMapFactory.Attributes);
        map.initializeLocal();

        return map;
    }
}
