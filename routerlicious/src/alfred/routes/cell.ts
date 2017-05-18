import * as express from "express";
import { defaultPartials } from "./partials";

const router = express.Router();

/**
 * Loading of a specific collaborative map
 */
router.get("/:id?", (request, response, next) => {
    const id = request.params.id ? request.params.id : "test";
    response.render(
        "cell",
        {
            id,
            partials: defaultPartials,
            title: id,
        });
});

export default router;
