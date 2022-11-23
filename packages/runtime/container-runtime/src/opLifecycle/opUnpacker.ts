/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, ContainerRuntimeMessage } from "..";
import { IProcessingResult, IRemoteMessageProcessor } from "./inbox";

/**
 * Unpacks runtime messages. This API makes no promises regarding backward-compatibility. This is internal API.
 *
 * @internal
 */
export class OpUnpacker implements IRemoteMessageProcessor {
    public processRemoteMessage(remoteMessage: ISequencedDocumentMessage): IProcessingResult {
        if (remoteMessage.type !== MessageType.Operation) {
            // Legacy format, but it's already "unpacked",
            // i.e. message.type is actually ContainerMessageType.
            // Or it's non-runtime message.
            // Nothing to do in such case.
            return { message: remoteMessage, state: "Skipped" };
        }

        // legacy op format?
        if (remoteMessage.contents.address !== undefined && remoteMessage.contents.type === undefined) {
            remoteMessage.type = ContainerMessageType.FluidDataStoreOp;
        } else {
            // new format
            const innerContents = remoteMessage.contents as ContainerRuntimeMessage;
            remoteMessage.type = innerContents.type;
            remoteMessage.contents = innerContents.contents;
        }

        return { message: remoteMessage, state: "Processed" };
    }
}
