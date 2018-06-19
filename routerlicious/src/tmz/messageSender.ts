import * as amqp from "amqplib";
import { EventEmitter } from "events";
import * as winston from "winston";
import { IMessage, IMessageSender } from "./messages";

class RabbitmqSender implements IMessageSender {

    private events = new EventEmitter();
    private rabbitmqConnectionString: string;
    private taskQueueName: string;
    private agentExchangeName: string;
    private connection: amqp.Connection;
    private channel: amqp.Channel;

    constructor(rabbitmqConfig: any, tmzConfig: any) {
        this.rabbitmqConnectionString = rabbitmqConfig.connectionString;
        this.taskQueueName = tmzConfig.taskQueueName;
        this.agentExchangeName = tmzConfig.agentExchangeName;
    }

    public async initialize() {
        this.connection = await amqp.connect(this.rabbitmqConnectionString);
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.taskQueueName, { durable: true });
        winston.info(`Rabbitmq task queue ready to produce!`);
        await this.channel.assertExchange(this.agentExchangeName, "fanout", { durable: true });
        winston.info(`Rabbitmq ready to produce in agent exchage!`);

        this.connection.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

    public sendTask(message: IMessage) {
        this.channel.sendToQueue(this.taskQueueName, new Buffer(JSON.stringify(message)), { persistent: true });
    }

    public sendAgent(message: IMessage) {
        this.channel.publish(this.agentExchangeName, "", new Buffer(JSON.stringify(message)), { persistent: true });
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
