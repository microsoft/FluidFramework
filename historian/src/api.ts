import { Router } from "express";

export const router: Router = Router();

/**
 * Retrieves commits for the given branch
 */
router.get("/documents/:id/:branch/commits", (request, response, next) => {
    response.json({});
});
