/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

export const waitForOpCatchUp = async (containerRuntime: IContainerRuntime): Promise<void> => {
    if (containerRuntime.attachState === AttachState.Detached) {
        return;
    }

    return new Promise<void>((resolve, reject) => {
        if (containerRuntime.deltaManager.disposed) {
            reject(new Error("Disposed"));
        }

        containerRuntime.once("dispose", reject);

        const waitForOps = () => {
            const deltaManager = containerRuntime.deltaManager;
            const lastKnownSeqNumber = deltaManager.lastKnownSeqNumber;

            if (lastKnownSeqNumber <= deltaManager.lastSequenceNumber) {
                resolve();
                containerRuntime.off("dispose", reject);
            }

            const opCallback = (message: ISequencedDocumentMessage) => {
                if (lastKnownSeqNumber <= message.sequenceNumber) {
                    resolve();
                    deltaManager.off("op", opCallback);
                    containerRuntime.off("dispose", reject);
                }
            };

            deltaManager.on("op", opCallback);
        };

        if (containerRuntime.connected) {
            waitForOps();
        } else {
            containerRuntime.once("connected", waitForOps);
        }
    });
};
