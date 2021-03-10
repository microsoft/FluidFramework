/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory, IConsumer } from "@fluidframework/server-services-core";
import { IResources, IRunner, IRunnerFactory } from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import { KafkaRunner } from "./runner";

export interface IKafkaResources extends IResources {
    lambdaFactory: IPartitionLambdaFactory;

    consumer: IConsumer;

    config: Provider;
}

export class KafkaRunnerFactory implements IRunnerFactory<IKafkaResources> {
    public async create(resources: IKafkaResources): Promise<IRunner> {
        return new KafkaRunner(
            resources.lambdaFactory,
            resources.consumer,
            resources.config);
    }
}
