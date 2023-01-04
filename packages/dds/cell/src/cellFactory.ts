/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { SharedCell } from "./cell";
import { ISharedCell } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedCell}.
 *
 * @sealed
 */
export class CellFactory implements IChannelFactory {
    /**
     * {@inheritDoc CellFactory."type"}
     */
    public static readonly Type = "https://graph.microsoft.com/types/cell";

    /**
     * {@inheritDoc CellFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: CellFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
     */
    public get type(): string {
        return CellFactory.Type;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
     */
    public get attributes(): IChannelAttributes {
        return CellFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedCell> {
        const cell = new SharedCell(id, runtime, attributes);
        await cell.load(services);
        return cell;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
     */
    public create(document: IFluidDataStoreRuntime, id: string): ISharedCell {
        const cell = new SharedCell(id, document, this.attributes);
        cell.initializeLocal();
        return cell;
    }
}
