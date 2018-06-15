import { EventEmitter } from "events";
import * as minio from "minio";
import { getOrCreateMinioBucket } from "../utils";
import { IAgentUploader } from "./messages";

class MinioUploader implements IAgentUploader {

    private events = new EventEmitter();
    private minioClient: any;
    private minioBucket: string;

    constructor(config: any) {
        this.minioClient = new minio.Client({
            accessKey: config.accessKey,
            endPoint: config.endpoint,
            port: config.port,
            secretKey: config.secretKey,
            secure: false,
        });
        this.minioBucket = config.bucket;
    }

    public initialize() {
        getOrCreateMinioBucket(this.minioClient, this.minioBucket).then(() => {
            // Set up bucket policy to readwrite.
            this.minioClient.setBucketPolicy(this.minioBucket, "", minio.Policy.READWRITE, (err) => {
                if (err) {
                    this.events.emit("error", `Error setting up minio bucket policy: ${err}`);
                }
            });
            // Set up notification.
            this.minioClient.listenBucketNotification(this.minioBucket, "", ".zip", ["s3:ObjectCreated:*"])
            .on("notification", (record) => {
                this.events.emit("agentAdded", { type: "server", name: record.s3.object.key});
            });
            this.minioClient.listenBucketNotification(this.minioBucket, "", ".zip", ["s3:ObjectRemoved:*"])
            .on("notification", (record) => {
                this.events.emit("agentRemoved", { type: "server", name: record.s3.object.key});
            });
            this.minioClient.listenBucketNotification(this.minioBucket, "", ".js", ["s3:ObjectCreated:*"])
            .on("notification", (record) => {
                this.events.emit("agentAdded", { type: "client", name: record.s3.object.key});
            });
            this.minioClient.listenBucketNotification(this.minioBucket, "", ".js", ["s3:ObjectRemoved:*"])
            .on("notification", (record) => {
                this.events.emit("agentRemoved", { type: "client", name: record.s3.object.key});
            });
        }, (error) => {
            this.events.emit("error", `Error creating minio bucket ${this. minioBucket}: ${error}`);
        });
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }
}

// Factory to switch between different uploader types.
export function createUploader(type: string, config: any): IAgentUploader {
    return new MinioUploader(config);
}
