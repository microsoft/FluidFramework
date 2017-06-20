import * as kafkaRest from "kafka-rest";
import { EventEmitter } from "events";
// import * as kafkaNode from "kafka-node";
// import { debug } from "./debug";

export interface IConsumer {

    commitOffset(data: any): Promise<void>;

    shutdown();

    on(event: string, listener: Function): this;
}

class KafkaRestConsumer implements IConsumer {

    private client: any;
    private instance: any;
    protected events = new EventEmitter();

    constructor(private endpoint: string, private groupId: string, private topic: string) {
        this.create();
    }

    /**
     * Commit offsets using REST client directly.
     */
    public commitOffset(commitRequest: any): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            this.client.post(this.instance.getUri() + "/offsets", commitRequest, null, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(JSON.stringify(data));
                }
            });
        });
    }

    public shutdown() {
        this.instance.shutdown();
    }

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    private create(): Promise<any> {
        this.client = new kafkaRest({url: this.endpoint});
        return new Promise<any>((resolve, reject) => {
            this.client.consumer(this.groupId).join({
                "auto.commit.enable": "false",
                "auto.offset.reset": "smallest",
            }, (error, instance) => {
                if (error) {
                    reject(error);
                } else {
                    this.instance = instance;
                    const stream = instance.subscribe(this.topic);

                    stream.on("data", (msgs) => {
                        this.events.emit("data", msgs);
                    });

                    stream.on("error", (err) => {
                        this.events.emit("error", err);
                    });

                    resolve(instance.subscribe(this.topic));
                }
            });
        });
    }

}


/*
class KafkaNodeConsumer implements IConsumer {

    private client: any;
    private offset: any;
    private instance: any;

    constructor(private endpoint: string, private groupId: string, private topic: string) {
        this.client = new kafkaNode.Client(this.endpoint, this.groupId);
        this.offset = new kafkaNode.Offset(this.client);
    }

    public create(): Promise<any> {
        const groupId = this.groupId;
        return new Promise<any>((resolve, reject) => {
            this.ensureTopics(this.client, [this.topic]).then(
                () => {
                    this.instance = new kafkaNode.HighLevelConsumer(this.client, [{topic: this.topic}], <any> {
                        autoCommit: false,
                        fetchMaxBytes: 1024 * 1024,
                        fetchMinBytes: 1,
                        fromOffset: true,
                        groupId,
                        id: groupId,
                        maxTickMessages: 100000,
                    });
                }
            );
        });
    }

    private ensureTopics(client: kafkaNode.Client, topics: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // We make use of a refreshMetadata call to validate the given topics exist
            client.refreshMetadata(
                topics,
                (error, data) => {
                    if (error) {
                        debug(error);
                        return reject();
                    }

                    return resolve();
                });
        });
    }


}
*/



export function create(type: string, endPoint: string, groupId: string, topic: string): IConsumer {
    return new KafkaRestConsumer(endPoint, groupId, topic);
}

