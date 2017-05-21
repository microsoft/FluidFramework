import * as express from "express";
import { defaultPartials } from "./partials";

const router = express.Router();

/**
 * Script entry point root
 */
router.get("/", (request, response, next) => {
    response.render(
        "scribe",
        {
            id: request.params.id,
            partials: defaultPartials,
            title: "Scribe",
        });
});

export default router;
