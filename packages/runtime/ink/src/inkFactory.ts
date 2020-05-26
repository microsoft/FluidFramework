/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
} from "@fluidframework/component-runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { Ink } from "./ink";
import { pkgVersion } from "./packageVersion";

/**
 * Factory for Ink.
 * @sealed
 */
export class InkFactory implements ISharedObjectFactory {
    /**
     * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
     */
    public static Type = "https://graph.microsoft.com/types/ink";

    /**
     * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: InkFactory.Type,
        snapshotFormatVersion: "0.2",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
     */
    public get type() {
        return InkFactory.Type;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
     */
    public get attributes() {
        return InkFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.load}
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedObject> {
        const ink = new Ink(runtime, id, attributes);
        await ink.load(branchId, services);

        return ink;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.create}
     */
    public create(runtime: IComponentRuntime, id: string): ISharedObject {
        const ink = new Ink(runtime, id, InkFactory.Attributes);
        ink.initializeLocal();

        return ink;
    }
}
