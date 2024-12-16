/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITaskMessage, ITaskMessageReceiver } from "@fluidframework/server-services-core";
import * as amqp from "amqplib";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * @deprecated This was functionality related to RabbitMq which is not used anymore,
 * and will be removed in a future release.
 */
class RabbitmqReceiver implements ITaskMessageReceiver {
	private readonly events = new EventEmitter();
	private readonly rabbitmqConnectionString: string;
	private connection: amqp.Connection | undefined;
	private channel: amqp.Channel | undefined;

	constructor(
		private readonly rabbitmqConfig: any,
		private readonly taskQueueName: string,
	) {
		this.rabbitmqConnectionString = this.rabbitmqConfig.connectionString;
	}

	public async initialize() {
		this.connection = await amqp.connect(this.rabbitmqConnectionString);
		this.channel = await this.connection.createChannel();
		await this.channel.assertQueue(this.taskQueueName, { durable: true });
		winston.info(`Rabbitmq task channel ready to receive!`);
		Lumberjack.info(`Rabbitmq task channel ready to receive!`);

		// We don't need to ack the task messages since they will be part of next help message if unacked.
		// TODO: Reject messages and make sure the sender knows.
		this.channel
			.consume(
				this.taskQueueName,
				(msgBuffer) => {
					if (msgBuffer === null) {
						return;
					}
					const msgString = msgBuffer.content.toString();
					const msg = JSON.parse(msgString) as ITaskMessage;
					this.events.emit("message", msg);
				},
				{ noAck: true },
			)
			.catch((error) => {
				Lumberjack.error(
					"Error encountered when acking task messages in RabbitmqReceiver.initialize()",
					undefined,
					error,
				);
			});

		this.connection.on("error", (error) => {
			this.events.emit("error", error);
		});
	}

	public on(event: string, listener: (...args: any[]) => void): this {
		this.events.on(event, listener);
		return this;
	}

	public async close() {
		const closeChannelP = this.channel?.close();
		const closeConnectionP = this.connection?.close();
		await Promise.all([closeChannelP, closeConnectionP]);
	}
}

/**
 * Factory to switch between different message receiver.
 *
 * @deprecated This was functionality related to RabbitMq which is not used anymore,
 * and will be removed in a future release.
 * @internal
 */
export function createMessageReceiver(
	rabbitmqConfig: any,
	queueName: string,
): ITaskMessageReceiver {
	return new RabbitmqReceiver(rabbitmqConfig, queueName);
}
