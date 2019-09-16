/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedCell } from "./cell";
import { ISharedCell } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the map
 */
export class CellFactory implements ISharedObjectFactory {
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

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedCell> {

        const cell = new SharedCell(id, document);
        await cell.load(branchId, services);
        return cell;
    }

    public create(document: IComponentRuntime, id: string): ISharedCell {
        const cell = new SharedCell(id, document);
        cell.initializeLocal();
        return cell;
    }
}
