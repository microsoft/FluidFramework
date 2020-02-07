/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
    IChannel,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { pkgVersion } from "./packageVersion";
import { SharedMatrix } from "./matrix";

export class SharedMatrixFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/sharedmatrix";

    public static Attributes: IChannelAttributes = {
        type: SharedMatrixFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedMatrixFactory.Type;
    }

    public get attributes() {
        return SharedMatrixFactory.Attributes;
    }

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
    ): Promise<IChannel> {
        const matrix = new SharedMatrix(document, id);
        await matrix.load(branchId, services);
        return matrix;
    }

    public create(document: IComponentRuntime, id: string): IChannel {
        const matrix = new SharedMatrix(document, id);
        matrix.initializeLocal();
        return matrix;
    }
}
