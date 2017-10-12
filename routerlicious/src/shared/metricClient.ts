import * as telegraf from "telegrafjs";

export interface IMetricClient {

    // tslint:disable-next-line:max-line-length
    writeLatencyMetric(traceId: string, local: string, intermediate: string, global: string, timestamp: number): Promise<void>;
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

    // tslint:disable-next-line:max-line-length
    public writeLatencyMetric(traceId: string, local: string, intermediate: string, global: string, timestamp: number): Promise<void> {
        if (!this.connected || traceId === null) {
            return Promise.resolve();
        } else {
            return this.writeToTelegraf(traceId, local, intermediate, global, timestamp);
        }
    }

    // tslint:disable-next-line:max-line-length
    private writeToTelegraf(traceId: string, local: string, intermediate: string, global: string, timestamp: number): Promise<void> {
        const Measurement = telegraf.Measurement;
        const Int = telegraf.Int;

        return this.telegrafClient.sendMeasurement(new Measurement(
            "latency",
            { traceId },
            {
                timestamp: new Int(timestamp),
                local,
                intermediate,
                global,
            },
        ));
    }
}

class DefaultClient implements IMetricClient {

    // tslint:disable-next-line:max-line-length
    public writeLatencyMetric(traceId: string, local: string, intermediate: string, global: string, timestamp: number): Promise<void> {
        return Promise.resolve();
    }
}

export function createMetricClient(config: any): IMetricClient {
    // tslint:disable-next-line:max-line-length
    return (config !== undefined && config.client === "telegraf") ? new TelegrafClient(config.telegraf) : new DefaultClient();
}
