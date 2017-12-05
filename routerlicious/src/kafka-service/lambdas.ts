import * as nconf from "nconf";
import * as utils from "../utils";

export interface IContext {
    checkpoint(offset: number);
}

export interface IPartitionLambda {
    handler(message: utils.kafkaConsumer.IMessage): Promise<any>;
}

export interface IPartitionLambdaFactory {
    create(config: nconf.Provider, context: IContext): Promise<IPartitionLambda>;
}
