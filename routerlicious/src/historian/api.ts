import { Router } from "express";
import * as nconf from "nconf";
import * as gitStorage from "../git-storage";

export const router: Router = Router();

const gitSettings = nconf.get("git");
const manager = new gitStorage.GitManager("master", gitSettings.repository, gitSettings.storagePath);

// TODO need to rationalize the document/object id against branches of it - and if we need to store this
// For sure ID probably selects a 'repository'

/**
 * Helper function to retrieve the git branch for the given document id and document branch
 */
function getBranch(id: string, branch: string): string {
    return id;
}

/**
 * Retrieves commits for the given branch
 */
router.get("/documents/:id/:branch/commits", (request, response, next) => {
    const count = request.query.count || 10;

    manager.getCommits(getBranch(request.params.id, request.params.branch), request.query.from, count)
        .then((commits) => {
            response.json(commits);
        },
        (error) => {
            response.status(400).json(error);
        });
});

/**
 * Retrieves an object stored in the given document
 */
router.get("/documents/:id/:branch/object/:from/*", (request, response, next) => {
    manager.getObject(request.params.from, request.params[0])
        .then((contents) => {
            response.json(contents);
        },
        (error) => {
            response.status(400).json(error);
        });
});
