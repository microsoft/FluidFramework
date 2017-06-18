import { Router } from "express";
import { defaultPartials } from "./partials";

const router: Router = Router();

/**
 * Loading of a specific collaborative map
 */
router.get("/:id?", (request, response, next) => {
    const id = request.params.id ? request.params.id : "test";
    response.render(
        "canvas",
        {
            id,
            partials: defaultPartials,
            title: id,
        });
});

export default router;
