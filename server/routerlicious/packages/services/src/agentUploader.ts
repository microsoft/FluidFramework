/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IAgentUploader } from "@fluidframework/server-services-core";
import * as minio from "minio";

async function bucketExists(minioClient, bucket: string) {
    return new Promise<boolean>((resolve, reject) => {
        minioClient.bucketExists(bucket, (error, exists) => {
            if (error) {
                reject(error);
            } else {
                resolve(exists);
            }
        });
    });
}

async function makeBucket(minioClient, bucket: string) {
    return new Promise<void>((resolve, reject) => {
        minioClient.makeBucket(bucket, "us-east-1", (error) => {
            if (error) {
                return reject(error);
            } else {
                return resolve();
            }
        });
    });
}

function createReadWritePolicy(bucketName: string): string {
    const policy = {
        Statement: [
            {
                Action: [
                    "s3:GetBucketLocation",
                    "s3:ListBucket",
                ],
                Effect: "Allow",
                Principal: { AWS: ["*"] },
                Resource: [`arn:aws:s3:::${bucketName}`],
                Sid: "",
            },
            {
                Action: [
                    "s3:PutObject",
                    "s3:GetObject",
                ],
                Effect: "Allow",
                Principal: { AWS: ["*"] },
                Resource: [`arn:aws:s3:::${bucketName}/*`],
                Sid: "",
            },
        ],
        Version: "2012-10-17",
    };

    return JSON.stringify(policy);
}

export async function getOrCreateMinioBucket(minioClient, bucket: string) {
    const exists = await bucketExists(minioClient, bucket);
    if (!exists) {
        // eslint-disable-next-line no-return-await
        return await makeBucket(minioClient, bucket);
    }
}

class MinioUploader implements IAgentUploader {
    private readonly events = new EventEmitter();
    private readonly minioClient: minio.Client;
    private readonly minioBucket: string;

    constructor(config: any) {
        this.minioClient = new minio.Client({
            accessKey: config.accessKey,
            endPoint: config.endpoint,
            port: config.port,
            secretKey: config.secretKey,
            useSSL: false,
        });
        this.minioBucket = config.bucket;
    }

    public async initialize() {
        await getOrCreateMinioBucket(this.minioClient, this.minioBucket);

        const policy = createReadWritePolicy(this.minioBucket);

        // Set up bucket policy to readwrite.
        this.minioClient.setBucketPolicy(this.minioBucket, policy, (err) => {
            if (err) {
                this.events.emit("error", `Error setting up minio bucket policy: ${err}`);
            }
        });

        // Set up notification.
        this.minioClient.listenBucketNotification(this.minioBucket, "", ".zip", ["s3:ObjectCreated:*"])
            .on("notification", (record) => {
                this.events.emit("agentAdded", { type: "server", name: record.s3.object.key });
            });
        this.minioClient.listenBucketNotification(this.minioBucket, "", ".zip", ["s3:ObjectRemoved:*"])
            .on("notification", (record) => {
                this.events.emit("agentRemoved", { type: "server", name: record.s3.object.key });
            });
        this.minioClient.listenBucketNotification(this.minioBucket, "", ".js", ["s3:ObjectCreated:*"])
            .on("notification", (record) => {
                this.events.emit("agentAdded", { type: "client", name: record.s3.object.key });
            });
        this.minioClient.listenBucketNotification(this.minioBucket, "", ".js", ["s3:ObjectRemoved:*"])
            .on("notification", (record) => {
                this.events.emit("agentRemoved", { type: "client", name: record.s3.object.key });
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
