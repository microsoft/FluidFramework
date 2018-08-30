import { AsyncQueue, queue } from "async";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import * as utils from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { Context } from "./context";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "./lambdas";

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition extends EventEmitter {
    private q: AsyncQueue<utils.IMessage>;
    private lambdaP: Promise<IPartitionLambda>;
    private checkpointManager: CheckpointManager;
    private context: Context;

    constructor(
        id: number,
        factory: IPartitionLambdaFactory,
        consumer: utils.IConsumer,
        config: Provider) {
        super();

        this.checkpointManager = new CheckpointManager(id, consumer);
        this.context = new Context(this.checkpointManager);
        this.context.on("error", (error: any, restart: boolean) => {
            this.emit("error", error, restart);
        });

        this.lambdaP = factory.create(config, this.context);
        this.lambdaP.catch((error) => {
            this.emit("error", error, true);
        });

        // Create the incoming message queue
        this.q = queue((message: utils.IMessage, callback) => {
            this.processCore(message, this.context).then(
                () => {
                    callback();
                },
                (error) => {
                    callback(error);
                });
        }, 1);

        this.q.error = (error) => {
            this.emit("error", error, true);
        };
    }

    public process(rawMessage: utils.IMessage) {
        this.q.push(rawMessage);
    }

    public close(): void {
        // Stop any pending message processing
        this.q.kill();

        // Close checkpoint related classes
        this.checkpointManager.close();
        this.context.close();

        // Notify the lambda (should it be resolved) of the close
        this.lambdaP.then(
            (lambda) => {
                lambda.close();
            },
            (error) => {
                // lambda never existed - no need to close
            });

        return;
    }

    /**
     * Stops processing on the partition
     */
    public async drain(): Promise<void> {
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

    private async processCore(message: utils.IMessage, context: IContext): Promise<void> {
        winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
        const lambda = await this.lambdaP;
        lambda.handler(message);
    }
}
