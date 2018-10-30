import { IProducer } from "@prague/routerlicious/dist/utils";
import { Deferred } from "@prague/utils";
import * as Kafka from "node-rdkafka";

export class RdkafkaProducer implements IProducer {
    private producer: Kafka.Producer;

    constructor(endpoint: string, private topic: string) {

        this.producer = new Kafka.Producer(
            {
                "dr_cb": true,    // delivery report callback
                "metadata.broker.list": endpoint,
            },
            null);
        this.producer.setPollInterval(1);

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
        this.producer.connect(null, (error, data) => {
            console.log(`Connected`, error, data);
        });

        this.producer.on("delivery-report", (err, report) => {
            if (err) {
                console.error(err);
            }

            console.log(report);

            if (err) {
                report.opaque.reject(err);
            } else {
                report.opaque.resolve();
            }
        });
    }

    public send(message: string, key: string): Promise<any> {
        const deferred = new Deferred<void>();

        try {
            this.producer.produce(
                this.topic,
                null,
                Buffer.from(message),
                key,
                Date.now(),
                deferred);
        } catch (error) {
            if (Kafka.CODES.ERRORS.ERR__QUEUE_FULL === error.code) {
                console.log("BUFFER FULL!!! -- need to store or provide back pressure");
            }
        }

        return deferred.promise;
    }

    public close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.producer.disconnect((err, data) => err ? reject(err) : resolve());
        });
    }
}
