import { Router } from "express";
import * as nconf from "nconf";
import * as request from "request";
import * as gitStorage from "../../git-storage";

const gitConfig = nconf.get("git");

/**
 * Retrieves the stored object
 */
async function getObject(objectId: string, version: string, path: string): Promise<string> {
    const url =
        `${gitConfig.historian}/repos/${gitConfig.repository}/contents/${path}?ref=${encodeURIComponent(version)}`;
    return new Promise<string>((resolve, reject) => {
        request.get(
            {
                url,
                json: true,
            },
            (error, response, body) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode !== 200) {
                    reject(response.statusCode);
                } else {
                    resolve(Buffer.from(body.content, body.encoding).toString("utf-8"));
                }
            });
    });
}

const repoP = gitStorage.getOrCreateRepository(gitConfig.historian, gitConfig.repository);

const router: Router = Router();

/**
 * Retrieves the given document.
 */
router.get("/:id/:version/*", async (request, response, next) => {
    // Now grab the snapshot, any deltas post snapshot, and send to the client
    const resultP = getObject(request.params.id, request.params.version, request.params[0]);
    resultP.then(
        (result) => {
            // TODO we will want clients to set the encoding - but for now default to text/plain to enable gzip
            response.set("Content-Type", "text/plain");
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
    repoP.then((manager) => {
        const files = request.body.map((object) => ({ path: object.path, data: JSON.stringify(object.data) }));
        const resultP = manager.write(request.params.id, files, "Commit @{TODO seq #}");
        resultP.then(
            (result) => {
                response.end(result);
            },
            (error) => {
                response.status(400).json(error);
            });
        }, (error) => {
            response.status(400).json(error);
        });
});

export default router;
