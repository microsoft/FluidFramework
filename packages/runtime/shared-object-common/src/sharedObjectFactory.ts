/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannel,
    IChannelAttributes,
    IComponentRuntime,
    ISharedObjectServices,
} from "@microsoft/fluid-runtime-definitions";

/**
 * Definitions of a shared object factory. Factories follow a common model but enable custom behavior.
 */
export interface ISharedObjectFactory {
    /**
     * String representing the type of the factory.
     */
    readonly type: string;

    /**
     * Attributes of the shared object.
     */
    readonly attributes: IChannelAttributes;

    /**
     * Loads the given shared object. This call is only ever invoked internally as the only thing
     * that is ever directly loaded is the document itself. Load will then only be called on documents that
     * were created and added to a shared object.
     * @param runtime - Component runtime containing state/info/helper methods about the component.
     * @param id - ID of the shared object.
     * @param services - Services to read objects at a given path using the delta connection.
     * @param branchId - The branch ID.
     * @param channelAttributes - The attributes for the the channel to be loaded.
     * @returns The loaded object
     *
     * @privateRemarks
     * Thought: should the storage object include the version information and limit access to just files
     * for the given object? The latter seems good in general. But both are probably good things. We then just
     * need a way to allow the document to provide later storage for the object.
     */
    load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel>;

    /**
     * Creates a local version of the shared object.
     * Calling attach on the object later will insert it into the object stream.
     * @param runtime - The runtime the new object will be associated with
     * @param id - The unique ID of the new object
     * @returns The newly created object.
     *
     * @privateRemarks
     * NOTE here - When we attach we need to submit all the pending ops prior to actually doing the attach
     * for consistency.
     */
    create(runtime: IComponentRuntime, id: string): IChannel;
}
