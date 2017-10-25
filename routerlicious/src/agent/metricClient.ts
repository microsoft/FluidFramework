import * as telegraf from "telegrafjs";
import { core } from "../client-api";

export interface IMetricClient {
    writeLatencyMetric(series: string, traces: core.ITrace[]): Promise<void>;
}

class TelegrafClient implements IMetricClient {
    private telegrafClient: any;
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

    public writeLatencyMetric(series: string, traces: core.ITrace[]): Promise<void> {
        if (!this.connected || !traces || traces.length === 0) {
            return Promise.resolve();
        } else {
            return this.writeToTelegraf(series, this.createTelegrafRow(traces));
        }
    }

    private createTelegrafRow(traces: core.ITrace[]): Object {
        let row = new Object();
        const Int = telegraf.Int;
        for (let trace of traces) {
            row[trace.service + "-" + trace.action] = new Int(trace.timestamp);
        }
        return row;
    }

    private writeToTelegraf(series: string, row: Object): Promise<void> {
        const Measurement = telegraf.Measurement;

        return this.telegrafClient.sendMeasurement(new Measurement(
            series,
            {},
            row,
        ));
    }
}

// Default client for loca run.
class DefaultClient implements IMetricClient {

    public writeLatencyMetric(series: string, traces: core.ITrace[]): Promise<void> {
        return Promise.resolve();
    }
}

export function createMetricClient(config: any): IMetricClient {
    // tslint:disable-next-line:max-line-length
    return (config !== undefined && config.client === "telegraf") ? new TelegrafClient(config.telegraf) : new DefaultClient();
}
