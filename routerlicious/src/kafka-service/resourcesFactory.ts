import * as moniker from "moniker";
import { Provider } from "nconf";
import * as utils from "../utils";
import { IPartitionLambdaFactory } from "./lambdas";

export interface IKafkaResources extends utils.IResources {
    lambdaFactory: IPartitionLambdaFactory;

    consumer: utils.IConsumer;

    config: Provider;
}

export class KafkaResources implements IKafkaResources {
    constructor(
        public lambdaFactory: IPartitionLambdaFactory,
        public consumer: utils.IConsumer,
        public config: Provider) {
    }

    public async dispose(): Promise<void> {
        const consumerClosedP = this.consumer.close();
        await Promise.all([consumerClosedP]);
    }
}

export class KafkaResourcesFactory implements utils.IResourcesFactory<KafkaResources> {
    constructor(private name, private lambdaModule) {
    }

    public async create(config: Provider): Promise<KafkaResources> {
        const plugin = require(this.lambdaModule);
        const lambdaFactory = await plugin.create(config) as IPartitionLambdaFactory;

        // Inbound Kafka configuration
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");

        // Receive topic and group - for now we will assume an entry in config mapping
        // to the given name. Later though the lambda config will likely be split from the stream config
        const streamConfig = config.get(`lambdas:${this.name}`);
        const groupId = streamConfig.group;
        const receiveTopic = streamConfig.topic;

        const clientId = moniker.choose();
        let consumer = utils.createConsumer(kafkaLibrary, kafkaEndpoint, clientId, groupId, receiveTopic, false);

        return new KafkaResources(
            lambdaFactory,
            consumer,
            config);
    }
}
