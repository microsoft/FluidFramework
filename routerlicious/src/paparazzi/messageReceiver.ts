import * as amqp from "amqplib";
import { EventEmitter } from "events";
import * as winston from "winston";
import { IMessage, IMessageReceiver } from "./messages";

class RabbitmqReceiver implements IMessageReceiver {

    private events = new EventEmitter();
    private rabbitmqConnectionString: string;
    private messageQueueName: string;
    private connection: amqp.Connection;
    private channel: amqp.Channel;

    constructor(rabbitmqConfig: any, tmzConfig: any) {
        this.rabbitmqConnectionString = rabbitmqConfig.connectionString;
        this.messageQueueName = tmzConfig.messageQueueName;
    }

    public async initialize() {
        this.connection = await amqp.connect(this.rabbitmqConnectionString);
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.messageQueueName, { durable: true });
        winston.info(`Rabbitmq channel ready to receive!`);

        // We don't need to ack the messages since they will be part of next help message if unacked.
        this.channel.consume(this.messageQueueName, (msgBuffer) => {
            const msgString = msgBuffer.content.toString();
            const msg = JSON.parse(msgString) as IMessage;
            this.events.emit("message", msg);
        }, {noAck: true});

        this.connection.on("error", (error) => {
            this.events.emit("error", error);
        });
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

// Factory to switch between different message receiver.
export function createMessageReceiver(rabbitmqConfig: any, tmzConfig: any): IMessageReceiver {
    return new RabbitmqReceiver(rabbitmqConfig, tmzConfig);
}
