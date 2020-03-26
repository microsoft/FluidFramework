/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
} from "@microsoft/fluid-runtime-definitions";
import {
    ISharedObject,
    ISharedObjectFactory,
} from "@microsoft/fluid-shared-object-base";
import { pkgVersion } from "./packageVersion";
import { SummarizableObject } from "./summarizableObject";


/**
 * The factory that defines the summarizable object.
 * @sealed
 */
export class SummarizableObjectFactory implements ISharedObjectFactory {
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    public static readonly Type = "https://graph.microsoft.com/types/summarizable-object";

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: SummarizableObjectFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    public get type() {
        return SummarizableObjectFactory.Type;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    public get attributes() {
        return SummarizableObjectFactory.Attributes;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.load}
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<ISharedObject> {

        const object = new SummarizableObject(id, runtime, attributes);
        await object.load(branchId, services);

        return object;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.create}
     */
    public create(runtime: IComponentRuntime, id: string): ISharedObject {
        const object = new SummarizableObject(id, runtime, SummarizableObjectFactory.Attributes);
        object.initializeLocal();

        return object;
    }
}
