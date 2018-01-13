import * as utils from "../utils";
import { KafkaResources } from "./resourcesFactory";
import { KafkaRunner } from "./runner";

export class KafkaRunnerFactory implements utils.IRunnerFactory<KafkaResources> {
    public async create(resources: KafkaResources): Promise<utils.IRunner> {
        return new KafkaRunner(
            resources.lambdaFactory,
            resources.consumer,
            resources.config);
    }
}
