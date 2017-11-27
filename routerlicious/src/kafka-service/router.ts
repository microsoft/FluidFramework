import * as async from "async";
import * as winston from "winston";
import * as core from "../core";

// TODO better name than router - since is actually doing the processing

export interface ILambda {
    // And then this is the createFork section.
    // What would it mean if this was *completely* stateless. We load position, write it, etc...
    // each time? Can we afford to serialize to Mongo each time? Does it hurt throughput to enable this?
    handler(message: core.ISequencedOperationMessage): Promise<void>;
}

export interface ILambdaFactory {
    // This would be the DocumentManager.Create part...
    create(): Promise<ILambda>;
}

// Partition contains a collection of threads
// Threads execute a lambda handler and in order
// Thread maintains an execution context across call
// Partition queries threads for how far completed they are

export class Router {
    private queue: AsyncQueue<core.ISequencedOperationMessage>;

    constructor(id: string) {
        this.queue = async.queue<core.ISequencedOperationMessage, any>(
            (message, callback) => {
                this.routeCore(message).then(
                    () => {
                        callback();
                    },
                    (error) => {
                        callback(error);
                    });
            },
            1);

        this.queue.error = (error, task) => {
            winston.error("Router error", error);
        };
    }

    /**
     * Routes the provided message
     */
    public route(message: core.ISequencedOperationMessage) {
        this.queue.push(message);
    }

    /**
     * Callback invoked to process a message
     */
    private async routeCore(message: core.ISequencedOperationMessage): Promise<void> {
        winston.info(`${message.documentId}:${message.type}`);

        // TODO this is where I need to override to custom processing. Pass in value bag received from earlier.
        // Ideally everything else is shared and future clients just load in state. And then implement their
        // custom processing here.
    }
}
