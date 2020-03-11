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

    public static readonly Attributes: IChannelAttributes = {
        type: SharedMatrixFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
        metadata: undefined,
    };

    public get type() {
        return SharedMatrixFactory.Type;
    }

    public get attributes() {
        return SharedMatrixFactory.Attributes;
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes,
    ): Promise<IChannel> {
        const matrix = new SharedMatrix(runtime, id, attributes);
        await matrix.load(branchId, services);
        return matrix;
    }

    public create(document: IComponentRuntime, id: string): IChannel {
        const matrix = new SharedMatrix(document, id, this.attributes);
        matrix.initializeLocal();
        return matrix;
    }
}
