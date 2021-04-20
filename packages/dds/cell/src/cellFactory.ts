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
 * The factory that defines the map
 */
export class CellFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/cell";

    public static readonly Attributes: IChannelAttributes = {
        type: CellFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return CellFactory.Type;
    }

    public get attributes() {
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

    public create(document: IFluidDataStoreRuntime, id: string): ISharedCell {
        const cell = new SharedCell(id, document, this.attributes);
        cell.initializeLocal();
        return cell;
    }
}
