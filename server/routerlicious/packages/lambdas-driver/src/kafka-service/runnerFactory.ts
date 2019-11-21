/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRunner, IRunnerFactory } from "@microsoft/fluid-server-services-utils";
import { IKafkaResources } from "./resourcesFactory";
import { KafkaRunner } from "./runner";

export class KafkaRunnerFactory implements IRunnerFactory<IKafkaResources> {
    public async create(resources: IKafkaResources): Promise<IRunner> {
        return new KafkaRunner(
            resources.lambdaFactory,
            resources.consumer,
            resources.config);
    }
}
