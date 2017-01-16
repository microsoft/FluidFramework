import * as storage from "azure-storage";
import * as promisify from "es6-promisify";
import * as express from "express";
import * as nconf from "nconf";

// Create access to blob storage
let connectionInfo = nconf.get("blob");
let blobService = storage.createBlobService(connectionInfo.name, connectionInfo.key);

let router = express.Router();

// Create promise specific versions of storage commands
let getBlobToText = promisify(blobService.getBlobToText, blobService);

router.get("/:id", (request: express.Request, response: express.Response, next: express.NextFunction) => {
    // tslint:disable-next-line:no-string-literal
    let id = request.params["id"];
    let textP = getBlobToText("knowledge", id);

    textP.then(
        (result) => {
            response.json(JSON.parse(result));
        },
        (error) => {
            response.status(400).json(error);
        });
});

export = router;
