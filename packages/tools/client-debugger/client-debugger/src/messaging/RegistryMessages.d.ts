/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerMetadata } from "../ContainerMetadata";
import { IDebuggerMessage } from "./Messages";
/**
 * Inbound event requesting the list of Container IDs for which debuggers have been registered.
 * Will result in the {@link RegistryChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerListMessage extends IDebuggerMessage<undefined> {
    type: "GET_CONTAINER_LIST";
}
/**
 * Message data format used by {@link RegistryChangeMessage}.
 *
 * @public
 */
export interface RegistryChangeMessageData {
    /**
     * Metadata list of Containers with active Client Debugger sessions registered.
     */
    containers: ContainerMetadata[];
}
/**
 * Outbound event indicating a change in the debugger registry (i.e. a debugger has been registered or closed).
 * Includes the new list of active debugger Container IDs.
 *
 * @public
 */
export interface RegistryChangeMessage extends IDebuggerMessage<RegistryChangeMessageData> {
    type: "REGISTRY_CHANGE";
}
//# sourceMappingURL=RegistryMessages.d.ts.map