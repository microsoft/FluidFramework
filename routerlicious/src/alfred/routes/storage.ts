import { Router } from "express";
import * as minio from "minio";
import * as nconf from "nconf";
import { Readable } from "stream";

const storageBucket = nconf.get("alfred:bucket");

// Gain access to the document storage
const minioConfig = nconf.get("minio");
const minioClient = new minio.Client({
    accessKey: minioConfig.accessKey,
    endPoint: minioConfig.endpoint,
    port: minioConfig.port,
    secretKey: minioConfig.secretKey,
    secure: false,
});

/**
 * Retrieves the stored object
 */
async function getObject(objectId: string, bucket: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        minioClient.getObject(bucket, objectId, (error, stream: Readable) => {
            if (error) {
                return error.code === "NoSuchKey" ? resolve(null) : reject(error);
            }

            let object = "";

            // Set the encoding so that node does the conversion to a string
            stream.setEncoding("utf-8");
            stream.on("data", (chunk: string) => {
                object += chunk;
            });

            stream.on("end", () => {
                resolve(object);
            });

            stream.on("error", (streamError) => {
                reject(streamError);
            });
        });
    });
}

/**
 * Stores the object
 */
async function putObject(id: string, data: any): Promise<void> {
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

async function bucketExists(bucket: string) {
    return new Promise<boolean>((resolve, reject) => {
        minioClient.bucketExists(bucket, (error) => {
            if (error && error.code !== "NoSuchBucket") {
                reject(false);
            } else {
                resolve(error ? false : true);
            }
        });
    });
}

async function makeBucket(bucket: string) {
    return new Promise<boolean>((resolve, reject) => {
        minioClient.makeBucket(bucket, "us-east-1", (error) => {
            if (error) {
                reject(false);
            } else {
                resolve(error ? false : true);
            }
        });
    });
}

/**
 * Creates a new bucket.
 */
async function createBucket(id: string): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        const exists = await bucketExists(id);
        if (!exists) {
            const newBucket = await makeBucket(id);
            if (newBucket) {
                resolve();
            } else {
                reject();
            }
        } else {
            resolve();
        }
    });
}

const router: Router = Router();

/**
 * Retrieves the given document.
 */
router.get("/:id", (request, response, next) => {
    // Now grab the snapshot, any deltas post snapshot, and send to the client
    const resultP = getObject(request.params.id, storageBucket);
    resultP.then(
        (result) => {
            response.end(result);
        },
        (error) => {
            response.status(400).json(error);
        });
});

/**
 * Stores data for the given document.
 */
router.post("/:id", (request, response, next) => {
    const resultP = putObject(request.params.id, request.body);
    resultP.then(
        (result) => {
            response.end(result);
        },
        (error) => {
            response.status(400).json(error);
        });
});

/**
 * creates a new bucket.
 */
router.post("/create/:id", (request, response, next) => {
    const resultP = createBucket(request.params.id);
    resultP.then(
        (result) => {
            response.end(result);
        },
        (error) => {
            response.status(400).json(error);
        });
});

export default router;
