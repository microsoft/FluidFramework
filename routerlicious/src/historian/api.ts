import { Router } from "express";
import * as git from "./git";

export const router: Router = Router();

// Goal is to swap out minio completely...
//
// Need the storage call to be able to pull a file name from git. This should be at a specific commit #
// Retrieve all commit #'s for a document+branch

/**
 * Retrieves commits for the given branch
 */
router.get("/documents/:id/:branch/commits", (request, response, next) => {
    git.getCommits(request.params.id, request.params.branch)
        .then((commits) => {
            response.json(commits);
        },
        (error) => {
            response.status(400).json(error);
        });
});
