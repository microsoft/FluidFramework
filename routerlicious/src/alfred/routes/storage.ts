import { Router } from "express";
import * as nconf from "nconf";
import * as request from "request";

const historian = nconf.get("git:historian");

/**
 * Retrieves the stored object
 */
async function getObject(objectId: string, version: string, path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(
            { url: `${historian}/api/documents/${objectId}/master/object/${version}/${path}`, json: true },
            (error, response, body) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode !== 200) {
                    reject(response.statusCode);
                } else {
                    resolve(body);
                }
            });
    });
}

const router: Router = Router();

/**
 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
 */
router.get("/:id/:version/*", async (request, response, next) => {
    // Now grab the snapshot, any deltas post snapshot, and send to the client
    const resultP = getObject(request.params.id, request.params.version, request.params[0]);
    resultP.then(
        (result) => {
            response.end(result);
        },
        (error) => {
            response.status(400).json({ error });
        });
});

export default router;
