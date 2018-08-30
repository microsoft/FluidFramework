import * as utils from "../utils";
import { IKafkaResources } from "./resourcesFactory";
import { KafkaRunner } from "./runner";

export class KafkaRunnerFactory implements utils.IRunnerFactory<IKafkaResources> {
    public async create(resources: IKafkaResources): Promise<utils.IRunner> {
        return new KafkaRunner(
            resources.lambdaFactory,
            resources.consumer,
            resources.config);
    }
}
