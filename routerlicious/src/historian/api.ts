import { Router } from "express";
import * as git from "./git";

export const router: Router = Router();

/**
 * Retrieves commits for the given branch
 */
router.get("/documents/:id/:branch/commits", (request, response, next) => {
    const count = request.query.count || 10;

    git.getCommits(request.params.id, request.params.branch, count, request.query.from)
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
    git.getObject(request.params.id, request.params.branch, request.params.from, request.params[0])
        .then((contents) => {
            response.json(contents);
        },
        (error) => {
            response.status(400).json(error);
        });
});
