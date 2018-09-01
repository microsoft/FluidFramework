import { Router } from "express";
import * as fs from "fs";
import * as minio from "minio";
import { Provider } from "nconf";
import * as path from "path";
import * as rimraf from "rimraf";
import { Readable } from "stream";
import * as unzip from "unzip-stream";
import * as webpack from "webpack";
import * as winston from "winston";

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

    // Uploads the webpacked script to minio and delete the temorary script.
    function uploadScript(moduleName: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const folder = "/tmp/build";
            const file = path.join(folder, `${moduleName}/webpacked_index.js`);
            const fileStream = fs.createReadStream(file);
            fs.stat(file, (error, stats) => {
              if (error) {
                  winston.error(`Webpacked file does not exist: ${error}`);
                  reject(error);
              }
              minioClient.putObject(storageBucket, `${moduleName}/index.js`, fileStream, stats.size, (err, etag) => {
                  rimraf(folder, (e) => {
                      if (e) {
                          winston.error(`Error deleting ${folder}: ${e}`);
                      }
                  });
                  if (err) {
                      winston.error(`Error uploading webpacked ${moduleName} to minio: ${err}`);
                      reject(err);
                  }
                  resolve();
              });
            });
        });
    }

    const router: Router = Router();

    /**
     * Retrieves a list of all module names stored in db.
     */
    router.get("/", (request, response, next) => {
        const names: string[] = [];
        const objectsStream = minioClient.listObjects(storageBucket, "", true);
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

    /**
     * Webpack a node module and delete the temorary folder.
     */
    router.post("/js/:id", async (request, response, next) => {
        const moduleFile = request.params.id;
        const moduleName = moduleFile.split(".")[0];
        minioClient.getObject(storageBucket, request.params.id, (error, stream: Readable) => {
            if (error) {
                // tslint:disable-next-line
                return error.code === "NoSuchKey" ? response.status(200).send(null) : response.status(400).json({ error });
            }
            stream
            .pipe(unzip.Extract({ path: `/tmp/temp_modules/${moduleName}` })
            .on("error", (err) => {
                winston.error(`Error writing unzipped module ${moduleName}: ${err}`);
                response.status(500).json( {status: "error"} );
            })
            .on("close", () => {
                const compiler = webpack({
                    entry: `/tmp/temp_modules/${moduleName}/${moduleName}/dist/index.js`,
                    output: {
                        filename: "webpacked_index.js",
                        path: `/tmp/build/${moduleName}`,
                    },
                    resolve: {
                        modules: [
                          "temp_modules",
                          "/tmp",
                        ],
                    },
                    target: "node",
                });

                const tempFolder = `/tmp/temp_modules`;
                compiler.run((err, stats) => {
                    if (err || stats.hasErrors()) {
                        winston.error(`Error packing: ${err}`);
                        rimraf(tempFolder, (e) => {
                            if (e) {
                                winston.error(`Error deleting ${tempFolder}: ${e}`);
                            }
                        });
                    } else {
                        winston.info(`Success packing!`);
                        rimraf(tempFolder, (e) => {
                            if (e) {
                                winston.error(`Error deleting ${tempFolder}: ${e}`);
                            }
                        });
                        uploadScript(moduleName).then(() => {
                            winston.info(`Uploaded script from: ${__dirname}`);
                        }, (uploadError) => {
                            winston.error(`Error uploading script: ${uploadError}`);
                        });
                    }
                });

                response.status(200).json( {status: "Done uploading webpacked js file!"} );
            }));
        });
    });

    return router;
}
