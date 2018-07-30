import * as amqp from "amqplib";
import { EventEmitter } from "events";
import * as winston from "winston";
import { IMessageReceiver, ITaskMessage } from "../core";

const agentDedupTimeoutMS = 10000;

class RabbitmqReceiver implements IMessageReceiver {

    private events = new EventEmitter();
    private rabbitmqConnectionString: string;
    private agentExchange: string;
    private connection: amqp.Connection;
    private channel: amqp.Channel;
    private agentDedupTimer: NodeJS.Timer;
    private agentMap = new Map<string, ITaskMessage>();

    constructor(private rabbitmqConfig: any, private tmzConfig: any, private taskQueueName: string) {
        this.rabbitmqConnectionString = this.rabbitmqConfig.connectionString;
        this.agentExchange = this.tmzConfig.agentExchange;
    }

    public async initialize() {
        this.connection = await amqp.connect(this.rabbitmqConnectionString);
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.taskQueueName, { durable: true });
        winston.info(`Rabbitmq task channel ready to receive!`);

        // We don't need to ack the task messages since they will be part of next help message if unacked.
        this.channel.consume(this.taskQueueName, (msgBuffer) => {
            const msgString = msgBuffer.content.toString();
            const msg = JSON.parse(msgString) as ITaskMessage;
            this.events.emit("message", msg);
        }, {noAck: true});

        // Exchange for agent messages.
        await this.channel.assertExchange(this.agentExchange, "fanout", {durable: true});
        const agentQueue = await this.channel.assertQueue("", {durable: true});
        winston.info(`Rabbitmq agent queue ready to receive!`);
        this.channel.bindQueue(agentQueue.queue, this.agentExchange, "");

        // Agents messages needs to be acked since they are sent only once.
        this.channel.consume(agentQueue.queue, (msgBuffer) => {
            const msgString = msgBuffer.content.toString();
            const msg = JSON.parse(msgString) as ITaskMessage;
            this.dedupAgents(msg);
            this.channel.ack(msgBuffer);
        }, {noAck: false});

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

    // Rabbiqmq does not provide message deduping. Handling dedup when multiple tmz prodcuer produces an agent.
    private dedupAgents(agentMessage: ITaskMessage) {
        this.agentMap.set(agentMessage.type, agentMessage);
        clearTimeout(this.agentDedupTimer);
        this.agentDedupTimer = setTimeout(() => {
            for (const agent of this.agentMap) {
                this.events.emit("message", agent[1]);
            }
            this.agentMap.clear();
        }, agentDedupTimeoutMS);
    }
}

// Factory to switch between different message receiver.
export function createMessageReceiver(rabbitmqConfig: any, tmzConfig: any, queueName: string): IMessageReceiver {
    return new RabbitmqReceiver(rabbitmqConfig, tmzConfig, queueName);
}
