import * as assert from "assert";
import { AsyncQueue, queue } from "async";
import { Provider } from "nconf";
import * as winston from "winston";
import * as utils from "../utils";
import { CheckpointManager, ICheckpointStrategy } from "./checkpointManager";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "./lambdas";

// partition should have its own Lambda type thing. Have some way to create threads off the partition, etc...
// private routers = new Map<string, Router>();

// // TODO this type of breakout is pretty specific to us. We might want some kind of topic handler, etc...
// const message = JSON.parse(rawMessage.value) as core.ISequencedOperationMessage;
// if (message.type !== core.SequencedOperationType) {
//     return;
// }

// // Create the router if it doesn't exist
// if (!this.routers.has(message.documentId)) {
//     const router = new Router(message.documentId /* possibly pass initialization context to router */);
//     this.routers.set(message.documentId, router);
// }

// // Route the message
// const router = this.routers.get(message.documentId);
// router.route(message);

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
 *
 * I think I want these to maintain checkpoint information per partition
 */
export class Partition {
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private lambdaP: Promise<IPartitionLambda>;
    private checkpointManager: CheckpointManager;
    private context: IContext;

    constructor(
        id: number,
        factory: IPartitionLambdaFactory,
        checkpointStrategy: ICheckpointStrategy,
        consumer: utils.kafkaConsumer.IConsumer,
        config: Provider) {

        this.checkpointManager = new CheckpointManager(id, checkpointStrategy, consumer);
        this.context = new Context(this.checkpointManager);
        this.lambdaP = factory.create(config, this.context);

        // TODO I could have the lambda specify its checkpointing policy to me - and then auto rev when
        // each promise returns

        // Create the incoming message queue
        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            const processedP = this.processCore(message, this.context).catch((error) => {
                    // TODO dead letter queue for bad messages, etc...
                    winston.error("Error processing partition message", error);
                });

            // TODO abstract me into a util to break on any error
            processedP.then(
                () => {
                    // We will send in more messages after they resolve the promise
                    callback();
                },
                (error) => {
                    // This promise should never have an error case. Might want a util to enforce this
                    // type of handling
                    assert.ok(false);
                });
        }, 1);

        // Need to expose error information
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
        return lambda.handler(message);
    }
}
