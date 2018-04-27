import * as nconf from "nconf";
import * as utils from "../utils";

export interface IContext {
    /**
     * Updates the checkpoint offset
     */
    checkpoint(offset: number);

    /**
     * Closes the context with an error. The restart flag indicates whether the error is recoverable and the lambda
     * should be restarted.
     */
    error(error: any, restart: boolean);
}

export interface IPartitionLambda {
    /**
     * Processes an incoming message
     */
    handler(message: utils.IMessage): void;

    /**
     * Closes the lambda. After being called handler will no longer be invoked and the lambda is expected to cancel
     * any deferred work.
     */
    close(): void;
}

/**
 * Factory for creating lambda related objects
 */
export interface IPartitionLambdaFactory {
    /**
     * Constructs a new lambda
     */
    create(config: nconf.Provider, context: IContext): Promise<IPartitionLambda>;

    /**
     * Disposes of the lambda factory
     */
    dispose(): Promise<void>;
}

/**
 * Lambda plugin definition
 */
export interface IPlugin {
    /**
     * Creates and returns a new lambda factory. Config is provided should the factory need to load any resources
     * prior to being fully constructed.
     */
    create(config: nconf.Provider): Promise<IPartitionLambdaFactory>;
}
