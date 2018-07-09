import * as amqp from "amqplib";
import { EventEmitter } from "events";
import * as winston from "winston";
import { IMessage, IMessageSender } from "../core";

class RabbitmqSender implements IMessageSender {

    private events = new EventEmitter();
    private rabbitmqConnectionString: string;
    private agentExchange: string;
    private taskQueues: string[];
    private connection: amqp.Connection;
    private channel: amqp.Channel;

    constructor(rabbitmqConfig: any, tmzConfig: any) {
        this.rabbitmqConnectionString = rabbitmqConfig.connectionString;
        this.agentExchange = tmzConfig.agentExchange;
        this.taskQueues = tmzConfig.queues;
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

        // Assert agent exchange.
        await this.channel.assertExchange(this.agentExchange, "fanout", { durable: true });
        winston.info(`Rabbitmq ready to produce in agent exchage!`);

        this.connection.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

    public sendTask(queueName: string, message: IMessage) {
        this.channel.sendToQueue(queueName, new Buffer(JSON.stringify(message)), { persistent: true });
    }

    public sendAgent(message: IMessage) {
        this.channel.publish(this.agentExchange, "", new Buffer(JSON.stringify(message)), { persistent: true });
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

// Factory to switch between different message sender.
export function createMessageSender(rabbitmqConfig: any, tmzConfig: any): IMessageSender {
    return new RabbitmqSender(rabbitmqConfig, tmzConfig);
}
