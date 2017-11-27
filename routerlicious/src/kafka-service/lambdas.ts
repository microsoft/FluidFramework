import * as utils from "../utils";

export interface IPartitionLambda {
    handler(message: utils.kafkaConsumer.IMessage): Promise<any>;
}

export interface IPartitionLambdaFactory {
    create(): Promise<IPartitionLambda>;
}
