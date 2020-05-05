/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITrace } from "@microsoft/fluid-protocol-definitions";

export interface IMetricClient {
    writeLatencyMetric(series: string, traces: ITrace[]): Promise<void>;
}

// Default client for loca run.
export class DefaultMetricClient implements IMetricClient {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public writeLatencyMetric(series: string, traces: ITrace[]): Promise<void> {
        return Promise.resolve();
    }
}
