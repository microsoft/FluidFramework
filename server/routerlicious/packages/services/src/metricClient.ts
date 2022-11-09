/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITrace } from "@fluidframework/protocol-definitions";
import * as telegraf from "telegrafjs";
import { DefaultMetricClient, IMetricClient } from "@fluidframework/server-services-core";

class TelegrafClient implements IMetricClient {
    private readonly telegrafClient: any;
    private connected: boolean = false;

    constructor(config: any) {
        this.telegrafClient = new telegraf.TelegrafTCPClient({
            host: config.host,
            port: config.port,
        });
        this.telegrafClient.connect().then(() => {
            this.connected = true;
        });
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public writeLatencyMetric(series: string, traces: ITrace[]): Promise<void> {
        return !this.connected || !traces || traces.length === 0
            ? Promise.resolve()
            : this.writeToTelegraf(series, this.createTelegrafRow(traces));
    }

    private createTelegrafRow(traces: ITrace[]): any {
        const row = {};
        const Float = telegraf.Float;
        for (const trace of traces) {
            // tslint:disable prefer-template
            const column = `${trace.service}${trace.action ? `-${trace.action}` : ""}`;
            row[column] = new Float(trace.timestamp);
        }
        return row;
    }

    private async writeToTelegraf(series: string, row: any): Promise<void> {
        const Measurement = telegraf.Measurement;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.telegrafClient.sendMeasurement(new Measurement(
            series,
            {},
            row,
        ));
    }
}

export function createMetricClient(config: any): IMetricClient {
    // eslint-disable-next-line max-len
    return (config !== undefined && config.client === "telegraf") ? new TelegrafClient(config.telegraf) : new DefaultMetricClient();
}
