import * as express from "express";
import { defaultPartials } from "./partials";

const router = express.Router();

/**
 * Loading of a specific collaborative map
 */
router.get("/:id", (request, response, next) => {
    response.render(
        "sharedText",
        {
            id: request.params.id,
            partials: defaultPartials,
            title: request.params.id,
        });
});

export default router;
