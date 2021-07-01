/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    extractBoxcar,
    IContext,
    IQueuedMessage,
    IPartitionLambda,
    ISequencedOperationMessage,
    IServiceConfiguration,
    SequencedOperationType,
} from "@fluidframework/server-services-core";

import shajs from "sha.js";
import Axios from "axios";

export class MoiraLambda implements IPartitionLambda {
    private pending = new Map<string, ISequencedOperationMessage[]>();
    private pendingOffset: IQueuedMessage | undefined;
    private current = new Map<string, ISequencedOperationMessage[]>();

    constructor(
        protected context: IContext,
        private readonly serviceConfiguration: IServiceConfiguration) {
    }

    public handler(message: IQueuedMessage) {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;

                // Remove traces and serialize content before writing to mongo.
                value.operation.traces = [];

                const topic = `${value.tenantId}/${value.documentId}`;

                let pendingMessages = this.pending.get(topic);
                if (!pendingMessages) {
                    pendingMessages = [];
                    this.pending.set(topic, pendingMessages);
                }

                pendingMessages.push(value);
            }
        }

        this.pendingOffset = message;
        this.sendPending();

        return undefined;
    }

    public close() {
        this.pending.clear();
        this.current.clear();
    }

    private sendPending() {
        // If there is work currently being sent or we have no pending work return early
        if (this.current.size > 0 || this.pending.size === 0) {
            return;
        }

        // Swap current and pending
        const temp = this.current;
        this.current = this.pending;
        this.pending = temp;
        const batchOffset = this.pendingOffset;

        const allProcessed: Promise<void[]>[] = [];

        // Process all the batches + checkpoint
        for (const [, messages] of this.current) {
            const processP = this.processMoiraCoreParallel(messages);
            allProcessed.push(processP);
        }

        Promise.all(allProcessed).then(
            () => {
                this.current.clear();
                this.context.checkpoint(batchOffset as IQueuedMessage);
                this.sendPending();
            },
            (error) => {
                this.context.error(error, { restart: true });
            });
    }

    private createDerivedGuid(referenceGuid: string, identifier: string) {
        const hexHash = shajs("sha1").update(`${referenceGuid}:${identifier}`).digest("hex");
        return `${hexHash.substr(0, 8)}-${hexHash.substr(8, 4)}-` +
            `${hexHash.substr(12, 4)}-${hexHash.substr(16, 4)}-${hexHash.substr(20, 12)}`;
    }

    private async processMoiraCoreParallel(messages: ISequencedOperationMessage[]) {
        const processedMessages: Map<string, Promise<void>> = new Map();

        for (const message of messages) {
            if (message?.operation?.type === "op") {
                const contents = JSON.parse(message.operation.contents);
                const opData = contents.contents?.contents?.content?.contents;
                if (opData && opData.op === 0 && opData.changeSet !== undefined) {
                    // At this point is checked to be submitted to Moira
                    const branchGuid: string = contents.contents.contents.content.address;

                    const currentProcessing = processedMessages.get(branchGuid);
                    if (currentProcessing) {
                        processedMessages.set(
                            branchGuid,
                            currentProcessing.then(async () => this.processMoiraCore(branchGuid, opData, message)),
                        );
                    } else {
                        processedMessages.set(branchGuid, this.processMoiraCore(branchGuid, opData, message));
                    }
                }
            }
        }
        return Promise.all(processedMessages.values());
    }

    private async processMoiraCore(
        branchGuid: string,
        opData: any,
        message: ISequencedOperationMessage,
    ): Promise<void> {
        const commitGuid = opData.guid;

        this.context.log?.info(
            `MH Commit: branch: ${branchGuid},
             commit ${commitGuid},
             changeSet:  ${JSON.stringify(opData.changeSet, undefined, 2)}`,
        );

        let parentCommitGuid = opData.referenceGuid;
        // Create a branch for the first commit that does not yet reference any other commit
        if (opData.referenceGuid === "") {
            parentCommitGuid = await this.createBranch(branchGuid);
        }

        await this.createCommit(commitGuid, parentCommitGuid, branchGuid, opData, message);
    }

    private async createBranch(branchGuid: string): Promise<string> {
        const rootCommitGuid = this.createDerivedGuid(branchGuid, "root");
         const branchCreationResponse = await Axios.post(`${this.serviceConfiguration.moira.endpoint}/branch`, {
            guid: branchGuid,
            rootCommitGuid,
            meta: {},
            created: 0,
        });

        if (branchCreationResponse.status === 200) {
            this.context.log?.info(`Branch with guid: ${branchGuid} created`);
        } else {
            this.context.log?.error(`Branch with guid ${branchGuid} failed`);
        }
        return rootCommitGuid;
    }

    private async createCommit(
        commitGuid: string,
        parentGuid: string,
        branchGuid: string,
        opData: any,
        message: ISequencedOperationMessage,
    ) {
        try {
            const commitData = {
                guid: commitGuid,
                branchGuid,
                parentGuid,
                meta: {
                    remoteHeadGuid: opData.remoteHeadGuid,
                    localBranchStart: opData.localBranchStart,
                    sequenceNumber: message.operation.sequenceNumber,
                    minimumSequenceNumber: message.operation.minimumSequenceNumber,
                },
            };
            const commitCreationResponse =
                await Axios.post(`${this.serviceConfiguration.moira.endpoint}/branch/${branchGuid}/commit`, {
                    ...commitData,
                    changeSet: JSON.stringify(opData.changeSet),
                    rebase: true,
                });
            if (commitCreationResponse.status === 200) {
                this.context.log?.info(`Commit created ${JSON.stringify(commitData)}`);
            } else {
                this.context.log?.error(`Commit failed ${JSON.stringify(commitData)}`);
            }
        } catch (e) {
            this.context.log?.error(`Commit failed. ${e.message}`);
        }
    }
}
