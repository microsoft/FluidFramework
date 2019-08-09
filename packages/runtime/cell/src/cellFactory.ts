/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { SharedCell } from "./cell";
import { ISharedCell } from "./interfaces";

/**
 * The factory that defines the map
 */
export class CellFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellFactory.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedCell> {

        const cell = new SharedCell(id, document);
        await cell.load(minimumSequenceNumber, headerOrigin, services);
        return cell;
    }

    public create(document: IComponentRuntime, id: string): ISharedCell {
        const cell = new SharedCell(id, document);
        cell.initializeLocal();
        return cell;
    }
}
