/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { EventData, EventProcessorHost, PartitionContext, FromTokenProviderOptions } from "@azure/event-processor-host";
import {
    BoxcarType,
    IBoxcarMessage,
    IConsumer,
    IQueuedMessage,
    IPartition,
} from "@microsoft/fluid-server-services-core";
import { debug } from "./debug";

interface IEventHubMessage extends IQueuedMessage {
    context: PartitionContext;
    data: EventData;
}

export class EventHubConsumer implements IConsumer {
    private readonly events = new EventEmitter();
    private readonly eventHost: EventProcessorHost;
    private readonly partitions = new Set<string>();

    constructor(
        endpoint: string,
        clientId: string,
        public groupId: string,
        public topic: string,
        autoCommit: boolean,
        storageEndpoint: string,
        storageContainerName: string,
        additionalOptions?: FromTokenProviderOptions,
    ) {
        console.log("Starting Event Hub");

        // Create the Event Processor Host
        this.eventHost = EventProcessorHost.createFromConnectionString(
            clientId,
            storageEndpoint,
            `${storageContainerName}-${groupId}`,
            endpoint,
            {
                consumerGroup: groupId,
                eventHubPath: topic,
                ...additionalOptions,
            });

        const startP = this.eventHost.start(
            (context, data) => this.handleMessage(context, data),
            (error) => this.error(error));

        startP.catch((error) => {
            debug("Error starting event hub");
            debug(JSON.stringify(error));
            this.error(error);
        });
    }

    public async commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void> {
        const eventHubMessage = queuedMessage as IEventHubMessage;
        if (eventHubMessage && eventHubMessage.context && eventHubMessage.data) {
            await eventHubMessage.context.checkpointFromEventData(eventHubMessage.data);

        } else {
            debug("Invalid message metadata");
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async close() {
        await this.eventHost.stop();
    }

    public async pause() {
        await this.eventHost.stop();
    }

    public async resume() {
        throw new Error("Not implemented");
    }

    private getPartitions(partitionIds: string[]): IPartition[] {
        const partitions = partitionIds.map((id) => {
            const partition: IPartition = {
                offset: 0,
                partition: parseInt(id, 10),
                topic: this.topic,
            };
            return partition;
        });

        return partitions;
    }

    private updatePartitions() {
        let changed = false;
        for (const partition of this.eventHost.receivingFromPartitions) {
            if (!this.partitions.has(partition)) {
                changed = true;
                break;
            }
        }

        if (!changed) {
            return;
        }

        const existing = this.getPartitions(Array.from(this.partitions));
        this.events.emit("rebalancing", existing);
        const newPartitions = this.getPartitions(this.eventHost.receivingFromPartitions);
        this.events.emit("rebalanced", newPartitions);

        this.partitions.clear();
        for (const partition of this.eventHost.receivingFromPartitions) {
            this.partitions.add(partition);
        }
    }

    private handleMessage(context: PartitionContext, data: EventData) {
        this.updatePartitions();

        const boxcarMessage: IBoxcarMessage = {
            contents: [data.body],
            documentId: data.body.documentId,
            tenantId: data.body.tenantId,
            type: BoxcarType,
        };

        const kafkaMessage: IEventHubMessage = {
            context,
            data,
            offset: data.sequenceNumber,
            partition: parseInt(context.partitionId, 10),
            topic: context.eventhubPath,
            value: boxcarMessage,
        };

        this.events.emit("data", kafkaMessage);
    }

    private error(error) {
        this.events.emit("error", error);
    }
}
