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
async function getObject(objectId: string, path: string, bucket: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        minioClient.getObject(bucket, `${objectId}/${path}`, (error, stream: Readable) => {
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

const router: Router = Router();

/**
 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
 */
router.get("/:id/*", async (request, response, next) => {
    // Now grab the snapshot, any deltas post snapshot, and send to the client
    const resultP = getObject(request.params.id, request.params[0], storageBucket);
    resultP.then(
        (result) => {
            response.end(result);
        },
        (error) => {
            response.status(400).json({ error });
        });
});

export default router;
