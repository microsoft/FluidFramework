/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "@microsoft/fluid-server-routerlicious/dist/kafka-service/lambdas";
import * as aria from "aria-nodejs-sdk";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { MetricsLambda } from "./lambda";

export class MetricsLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private logger: aria.AWTLogger, private eventName: string, private environment: string) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new MetricsLambda(this.logger, this.eventName, this.environment, context);
    }

    public async dispose(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            aria.AWTLogManager.flush(() => {
                resolve();
            });
        });
    }
}
