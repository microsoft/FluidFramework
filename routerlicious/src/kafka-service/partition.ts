import * as assert from "assert";
import { AsyncQueue, queue, retry } from "async";
import { Provider } from "nconf";
import * as winston from "winston";
import { assertNotRejected } from "../core-utils";
import * as utils from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "./lambdas";

class Context implements IContext {
    private offset;

    constructor(private checkpointManager: CheckpointManager) {
    }

    /**
     * Updates the checkpoint for the partition
     */
    public checkpoint(offset: number) {
        // We should only get increasing offsets from a context checkpoint
        assert(this.offset === undefined || offset >= this.offset);

        if (this.offset !== offset) {
            this.checkpointManager.checkpoint(offset);
        }
    }
}

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition {
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private lambdaP: Promise<IPartitionLambda>;
    private checkpointManager: CheckpointManager;
    private context: IContext;

    constructor(
        id: number,
        factory: IPartitionLambdaFactory,
        consumer: utils.kafkaConsumer.IConsumer,
        config: Provider) {

        this.checkpointManager = new CheckpointManager(id, consumer);
        this.context = new Context(this.checkpointManager);

        // Indefinitely attempt to create the lambda
        this.lambdaP = new Promise<IPartitionLambda>((resolve, reject) => {
            retry(
                {
                    interval: 100,
                    times: Number.MAX_VALUE,
                },
                (callback) => {
                    factory.create(config, this.context).then(
                        (lambda) => callback(null, lambda),
                        (error) => {
                            winston.info("Error creating lambda - retrying", error);
                            callback(error);
                        });
                },
                (error, result) => {
                    // This should never return an error. The retry logic is setup to indefinitely retry in the
                    // case we can't create the lambda
                    assert.ok(!error);
                    resolve(result);
                });
        });

        // Create the incoming message queue
        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            const processedP = this.processCore(message, this.context).catch((error) => {
                    // TODO dead letter queue for bad messages, etc...
                    winston.error("Error processing partition message. Possible data loss.", error);
                });

            // assert processedP only resolves
            assertNotRejected(processedP).then(() => callback());
        }, 1);
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
