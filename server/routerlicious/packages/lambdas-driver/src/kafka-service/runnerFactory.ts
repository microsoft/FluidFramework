/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IPartitionLambdaFactory,
    IConsumer,
    IResources,
    IRunner,
    IRunnerFactory,
} from "@fluidframework/server-services-core";
import { KafkaRunner } from "./runner";

export interface IKafkaResources extends IResources {
    lambdaFactory: IPartitionLambdaFactory;

    consumer: IConsumer;
}

export class KafkaRunnerFactory implements IRunnerFactory<IKafkaResources> {
    public async create(resources: IKafkaResources): Promise<IRunner> {
        return new KafkaRunner(resources.lambdaFactory, resources.consumer);
    }
}
