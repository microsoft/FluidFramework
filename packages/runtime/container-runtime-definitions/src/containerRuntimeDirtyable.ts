/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideContainerRuntimeDirtyable>> { }
}

export const IContainerRuntimeDirtyable: keyof IProvideContainerRuntimeDirtyable = "IContainerRuntimeDirtyable";

export interface IProvideContainerRuntimeDirtyable {
    IContainerRuntimeDirtyable: IContainerRuntimeDirtyable;
}

/**
 * Represents the runtime of the container with the ability to sense whether its message can change its dirty state
 */
export interface IContainerRuntimeDirtyable extends
    IProvideContainerRuntimeDirtyable {
    /**
     * Will return true for any message that affects the dirty state of this document.
     * This function can be used to filter out any runtime operations that should not be affecting whether or not
     * the IFluidDataStoreRuntime.isDocumentDirty call returns true/false
     * @param type - The type of ContainerRuntime message that is being checked
     * @param contents - The contents of the message that is being verified
     */
    isMessageDirtyable(message: ISequencedDocumentMessage): boolean;
}
