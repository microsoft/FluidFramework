/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { Ink } from "./ink";
import { pkgVersion } from "./packageVersion";

/**
 * Factory for Ink.
 */
export class InkFactory implements ISharedObjectFactory {
    /**
     * Static type identifier.
     */
    public static Type = "https://graph.microsoft.com/types/ink";

    public static Attributes: IChannelAttributes = {
        type: InkFactory.Type,
        snapshotFormatVersion: "0.2",
        packageVersion: pkgVersion,
    };

    public get type() {
        return InkFactory.Type;
    }

    public get attributes() {
        return InkFactory.Attributes;
    }

    /**
     * Creates a new Ink object and loads it with data from the given services.
     *
     * @param runtime - The ComponentRuntime that this ink will be associated with
     * @param id - Unique ID for the new ink
     * @param services - Services with the object storage to load from
     * @param branchId - branch ID (not used)
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedObject> {

        const ink = new Ink(runtime, id);
        await ink.load(branchId, services);

        return ink;
    }

    /**
     * Creates a new empty Ink object.
     *
     * @param runtime - The ComponentRuntime that this ink will be associated with
     * @param id - Unique ID for the new ink
     */
    public create(runtime: IComponentRuntime, id: string): ISharedObject {
        const ink = new Ink(runtime, id);
        ink.initializeLocal();

        return ink;
    }
}
