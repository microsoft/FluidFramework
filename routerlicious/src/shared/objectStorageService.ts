// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as minio from "minio";
import * as api from "../api";
import * as socketStorage from "../socket-storage";

const minioConfig = nconf.get("minio");
const storageBucket = nconf.get("paparazzi:bucket");

const minioClient = new minio.Client({
    accessKey: minioConfig.accessKey,
    endPoint: minioConfig.endpoint,
    port: minioConfig.port,
    secretKey: minioConfig.secretKey,
    secure: false,
});

async function bucketExists(bucket: string) {
    return new Promise<boolean>((resolve, reject) => {
        minioClient.bucketExists(bucket, (error) => {
            if (error && error.code !== "NoSuchBucket") {
                reject(error);
            } else {
                resolve(error ? false : true);
            }
        });
    });
}

async function makeBucket(bucket: string) {
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

async function getOrCreateBucket(bucket: string) {
    const exists = await bucketExists(bucket);
    if (!exists) {
        return await makeBucket(bucket);
    }
}

export class ObjectStorageService implements api.IObjectStorageService {
    private clientStorageService: api.IObjectStorageService;

    constructor(url: string) {
        this.clientStorageService = new socketStorage.ClientObjectStorageService(url);
    }

    public async ready() {
        return await getOrCreateBucket(storageBucket);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public read(id: string): Promise<any> {
        return this.clientStorageService.read(id);
    }

    /**
     * Writes to the object with the given ID
     */
    public write(id: string, data: any): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            minioClient.putObject(storageBucket, id, JSON.stringify(data), "application/json", (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}
