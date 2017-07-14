import { Router } from "express";

const router: Router = Router();

/**
 * Route to retrieve the home page for the app
 */
router.get("/", (request, response, next) => {
    const res = {
        Id: "Something"
    };
    response.status(200).json(res);
});

export default router;
