import { Deferred } from "@prague/utils";
import { Provider } from "nconf";
import * as winston from "winston";
import * as utils from "../utils";
import { IPartitionLambdaFactory } from "./lambdas";
import { PartitionManager } from "./partitionManager";

export class KafkaRunner implements utils.IRunner {
    private deferred: Deferred<void>;
    private partitionManager: PartitionManager;

    constructor(
        private factory: IPartitionLambdaFactory,
        private consumer: utils.IConsumer,
        private config: Provider) {
    }

    public start(): Promise<void> {
        this.deferred = new Deferred<void>();

        process.on("warning", (msg) => {
            console.trace("Warning", msg);
        });

        this.factory.on("error", (error) => {
            this.deferred.reject(error);
        });

        this.partitionManager = new PartitionManager(this.factory, this.consumer, this.config);
        this.partitionManager.on("error", (error, restart) => {
            this.deferred.reject(error);
        });

        return this.deferred.promise;
    }

    /**
     * Signals to stop the service
     */
    public async stop(): Promise<void> {
        winston.info("Stop requested");

        // stop listening for new updates
        this.consumer.pause();

        // Mark ourselves done once the topic manager has stopped processing
        const stopP = this.partitionManager.stop();
        this.deferred.resolve(stopP);

        return this.deferred.promise;
    }
}
