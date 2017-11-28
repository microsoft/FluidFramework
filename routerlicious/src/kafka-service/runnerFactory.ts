import * as moniker from "moniker";
import { Provider } from "nconf";
import * as utils from "../utils";
import { IPartitionLambdaFactory } from "./lambdas";
import { KafkaRunner } from "./runner";

export class KafkaResources implements utils.IResources {
    constructor(
        public lambdaFactory: IPartitionLambdaFactory,
        public consumer: utils.kafkaConsumer.IConsumer,
        public checkpointBatchSize: number,
        public checkpointTimeIntervalMsec: number) {
    }

    public async dispose(): Promise<void> {
        const consumerClosedP = this.consumer.close();
        await Promise.all([consumerClosedP]);
    }
}

export class KafkaResourcesFactory implements utils.IResourcesFactory<KafkaResources> {
    public async create(config: Provider): Promise<KafkaResources> {
        const plugin = require(process.argv[2]);
        const lambdaFactory = plugin.create() as IPartitionLambdaFactory;

        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");

        const groupId = plugin.id;
        const clientId = moniker.choose();
        const receiveTopic = config.get("routemaster:topics:receive");
        const checkpointBatchSize = config.get("routemaster:checkpointBatchSize");
        const checkpointTimeIntervalMsec = config.get("routemaster:checkpointTimeIntervalMsec");

        let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, clientId, groupId, receiveTopic, false);

        return new KafkaResources(
            lambdaFactory,
            consumer,
            checkpointBatchSize,
            checkpointTimeIntervalMsec);
    }
}

export class KafkaRunnerFactory implements utils.IRunnerFactory<KafkaResources> {
    public async create(resources: KafkaResources): Promise<utils.IRunner> {
        return new KafkaRunner(
            resources.lambdaFactory,
            resources.consumer,
            resources.checkpointBatchSize,
            resources.checkpointTimeIntervalMsec);
    }
}
