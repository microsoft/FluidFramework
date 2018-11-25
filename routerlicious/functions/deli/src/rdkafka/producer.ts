import { IProducer } from "@prague/routerlicious/dist/utils";
import { Deferred } from "@prague/utils";
import * as Kafka from "node-rdkafka";
// import * as Measured from "measured-core";
// import * as winston from "winston";

export class RdkafkaProducer implements IProducer {
    private producer: Kafka.Producer;
    private connected = false;
    // private meter = new Measured.Meter();
    private pending = new Array<{ message: string, key: string, deferred: Deferred<void> }>();
    private resolved = Promise.resolve();

    constructor(endpoint: string, private topic: string) {
        this.producer = new Kafka.Producer(
            {
                "dr_cb": true,    // delivery report callback
                "metadata.broker.list": endpoint,
                "queue.buffering.max.ms": 1,
            },
            null);
        this.producer.setPollInterval(100);

        // logging debug messages, if debug is enabled
        this.producer.on("event.log", (log) => {
            console.log(log);
        });

        // logging all errors
        this.producer.on("event.error", (err) => {
            console.error("Error from producer");
            console.error(err);
        });

        // Wait for the ready event before producing
        this.producer.on("ready", (arg) => {
            console.log("producer ready." + JSON.stringify(arg));
        });

        this.producer.on("disconnected", (arg) => {
            console.log("producer disconnected. " + JSON.stringify(arg));
        });

        // starting the producer
        this.producer.connect(
            null,
            (error, data) => {
                console.log(`Connected`, error, data);
                this.connected = true;
                this.sendPending();
            });

        this.producer.on("delivery-report", (err, report) => {
            if (err) {
                console.error(err);
                report.opaque.reject(err);
            } else {
                report.opaque.resolve();
            }
        });

        // setInterval(
        //     () => {
        //         winston.verbose(`Producer ${this.topic} stats`, this.meter.toJSON());
        //     },
        //     15000);
    }

    public async send(message: string, key: string): Promise<any> {
        const deferred = new Deferred<void>();

        if (!this.connected) {
            this.pending.push({ message, key, deferred });
            return this.resolved;
        }

        this.sendCore(message, key, deferred);

        return deferred.promise;
    }

    public close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.producer.disconnect((err, data) => err ? reject(err) : resolve());
        });
    }

    private sendPending() {
        for (const pending of this.pending) {
            this.sendCore(pending.message, pending.key, pending.deferred);
        }
        this.pending = null;
    }

    private sendCore(message: string, key: string, deferred: Deferred<void>) {
        this.producer.produce(
            this.topic,
            null,
            Buffer.from(message),
            key,
            Date.now(),
            deferred);
    }
}
