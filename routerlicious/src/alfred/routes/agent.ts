import { Router } from "express";
import * as minio from "minio";
import { Provider } from "nconf";
import { Readable } from "stream";

export function create(config: Provider): Router {

    const minioConfig = config.get("minio");
    const storageBucket = minioConfig.bucket;
    const minioClient = new minio.Client({
        accessKey: minioConfig.accessKey,
        endPoint: minioConfig.endpoint,
        port: minioConfig.port,
        secretKey: minioConfig.secretKey,
        secure: false,
    });

    const router: Router = Router();

    /**
     * Retrieves the stored module from server.
     */
    router.get("/:id", async (request, response, next) => {
        // Returns the stream.
        minioClient.getObject(storageBucket, request.params.id, (error, stream: Readable) => {
            if (error) {
                // tslint:disable-next-line
                return error.code === "NoSuchKey" ? response.status(200).send(null) : response.status(400).json({ error });
            }
            stream.pipe(response);
        });
    });

    return router;
}
