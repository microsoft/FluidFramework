/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { EmptyTaskMessageSender, ITaskMessage, ITaskMessageSender } from "@fluidframework/server-services-core";
import * as amqp from "amqplib";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

class RabbitmqTaskSender implements ITaskMessageSender {
    private readonly events = new EventEmitter();
    private readonly rabbitmqConnectionString: string;
    private readonly taskQueues: string[];
    private connection: amqp.Connection;
    private channel: amqp.Channel;

    constructor(rabbitmqConfig: any, config: any) {
        this.rabbitmqConnectionString = rabbitmqConfig.connectionString;
        this.taskQueues = config.queues;
    }

    public async initialize() {
        this.connection = await amqp.connect(this.rabbitmqConnectionString);
        this.channel = await this.connection.createChannel();

        // Assert task queues.
        const queuePromises = [];
        for (const queue of this.taskQueues) {
            queuePromises.push(this.channel.assertQueue(queue, { durable: true }));
        }
        await Promise.all(queuePromises);
        winston.info(`Rabbitmq task queues ready to produce!`);
        Lumberjack.info(`Rabbitmq task queues ready to produce!`);

        this.connection.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

    public sendTask(queueName: string, message: ITaskMessage) {
        this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), { persistent: false });
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async close() {
        const closeChannelP = this.channel.close();
        const closeConnectionP = this.connection.close();
        await Promise.all([closeChannelP, closeConnectionP]);
    }
}

// Factory to switch between specific message sender implementations. Returns a dummy implementation
// if rabbitmq configs are not provided.
export function createMessageSender(rabbitmqConfig: any, config: any): ITaskMessageSender {
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (rabbitmqConfig && rabbitmqConfig.connectionString) {
        return new RabbitmqTaskSender(rabbitmqConfig, config);
    } else {
        return new EmptyTaskMessageSender();
    }
}
