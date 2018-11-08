import { IProducer } from "@prague/routerlicious/dist/utils";
import { Deferred } from "@prague/utils";
import * as Measured from "measured-core";
import * as Kafka from "node-rdkafka";
import * as winston from "winston";

interface IBoxcar {
    deferred: Deferred<void>;
    messages: string[];
    size: number;
}

// 1MB max message size with a little bit of hacked scaling to account for UTF8 -> binary
const MaxMessageSize = 1024 * 1024 * 0.75;

export class RdkafkaProducer implements IProducer {
    private producer: Kafka.Producer;
    private connected = false;
    private meter = new Measured.Meter();
    private boxcars = new Map<string, IBoxcar[]>();

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
            this.meter.mark();

            if (err) {
                console.error(err);
                report.opaque.reject(err);
            } else {
                report.opaque.resolve();
            }
        });

        setInterval(
            () => {
                winston.verbose(`Producer ${this.topic} stats`, this.meter.toJSON());
            },
            15000);
    }

    public async send(message: string, key: string): Promise<any> {
        const empty = this.boxcars.size === 0;

        // TODO Depending on boxcar'ing key needs to also include tenant ID
        if (!this.boxcars.has(key)) {
            this.boxcars.set(key, []);
        }

        const boxcars = this.boxcars.get(key);
        if (boxcars.length === 0 || boxcars[boxcars.length - 1].size + message.length > MaxMessageSize) {
            boxcars.push({ deferred: new Deferred<void>(), messages: [], size: 0 });
        }

        const last = boxcars[boxcars.length - 1];
        last.size += message.length;
        last.messages.push(message);

        // schedule the send if not yet scheduled
        if (empty && this.connected) {
            setImmediate(() => this.sendPending());
        }

        return last.deferred.promise;
    }

    public close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.producer.disconnect((err, data) => err ? reject(err) : resolve());
        });
    }

    private sendPending() {
        for (const [key, value] of this.boxcars) {
            for (const boxcar of value) {
                winston.info(`Boxcar send to ${key} of ${boxcar.messages.length} messages`);
                this.sendCore(JSON.stringify(boxcar.messages), key, boxcar.deferred);
            }
        }

        this.boxcars.clear();
    }

    private sendCore(message: string, key: string, deferred: Deferred<void>) {
        try {
            this.producer.produce(
                this.topic,
                null,
                Buffer.from(message),
                key,
                Date.now(),
                deferred);
        } catch (error) {
            winston.error(error);
            if (Kafka.CODES.ERRORS.ERR__QUEUE_FULL === error.code) {
                console.log("BUFFER FULL!!! -- need to store or provide back pressure");
            }
        }
    }
}
