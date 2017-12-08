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
     * Retrieves a list of all module names stored in db.
     */
    router.get("/", (request, response, next) => {
        let names: string[] = [];
        let objectsStream = minioClient.listObjects(storageBucket, "", true);
        objectsStream.on("data", (obj) => {
            names.push(obj.name as string);
        });
        objectsStream.on("error", (error) => {
            response.status(500).json(error);
        });
        objectsStream.on("end", (data) => {
            response.status(200).json( { names } );
        });
    });

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
