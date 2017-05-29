import * as express from "express";
import { defaultPartials } from "./partials";

const router = express.Router();

/**
 * Script entry point root
 */
router.get("/", (request, response, next) => {
    response.render(
        "perf",
        {
            id: request.params.id,
            partials: defaultPartials,
            title: "Perf",
        });
});

export default router;