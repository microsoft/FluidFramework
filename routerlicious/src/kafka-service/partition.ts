import * as assert from "assert";
import { AsyncQueue, queue } from "async";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import * as utils from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "./lambdas";

class Context extends EventEmitter implements IContext {
    private offset;

    constructor(private checkpointManager: CheckpointManager) {
        super();
    }

    /**
     * Updates the checkpoint for the partition
     */
    public checkpoint(offset: number) {
        // We should only get increasing offsets from a context checkpoint
        assert(this.offset === undefined || offset >= this.offset);

        if (this.offset !== offset) {
            this.checkpointManager.checkpoint(offset).catch((error) => {
                // Close context on error. Once the checkpointManager enters an error state it will stay there.
                // We will look to restart on checkpointing given it likely indicates a Kafka connection issue.
                this.emit("close", error, true);
            });
        }
    }

    /**
     * Closes the context with an error. The restart flag indicates whether the error is recoverable and the lambda
     * should be restarted.
     */
    public close(error: any, restart: boolean) {
        this.emit("close", error, restart);
    }
}

export interface IPartitionRetryParams {
    interval: number;
    times: number;
}

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition extends EventEmitter {
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private lambdaP: Promise<IPartitionLambda>;
    private checkpointManager: CheckpointManager;
    private context: Context;

    constructor(
        id: number,
        factory: IPartitionLambdaFactory,
        consumer: utils.kafkaConsumer.IConsumer,
        config: Provider) {
        super();

        this.checkpointManager = new CheckpointManager(id, consumer);
        this.context = new Context(this.checkpointManager);
        this.context.on("close", (error: any, restart: boolean) => {
            this.emit("close", error, restart);
        });

        this.lambdaP = factory.create(config, this.context);
        this.lambdaP.catch((error) => {
            this.emit("close", error, true);
        });

        // Create the incoming message queue
        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            this.processCore(message, this.context).then(
                () => {
                    callback();
                },
                (error) => {
                    callback(error);
                });
        }, 1);

        this.q.error = (error) => {
            this.emit("close", error, true);
        };
    }

    public process(rawMessage: utils.kafkaConsumer.IMessage) {
        this.q.push(rawMessage);
    }

    /**
     * Stops processing on the partition
     */
    public async stop(): Promise<void> {
        // Drain the queue of any pending operations
        const drainedP = new Promise<void>((resolve, reject) => {
            // If not entries in the queue we can exit immediatley
            if (this.q.length() === 0) {
                winston.info("No pending work exiting early");
                return resolve();
            }

            // Wait until the queue is drained
            winston.info("Waiting for queue to drain");
            this.q.drain = () => {
                winston.info("Drained");
                resolve();
            };
        });
        await drainedP;

        // checkpoint at the latest offset
        await this.checkpointManager.flush();
    }

    private async processCore(message: utils.kafkaConsumer.IMessage, context: IContext): Promise<void> {
        winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
        const lambda = await this.lambdaP;
        lambda.handler(message);
    }
}
