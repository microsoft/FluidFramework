import * as express from "express";
import { defaultPartials } from "./partials";

let router = express.Router();

router.get("/:id", (req: express.Request, response: express.Response) => {
    response.render(
        "canvas",
        {
            // tslint:disable-next-line:no-string-literal
            id: `Canvas - ${req.params["id"]}`,
            partials: defaultPartials,
        });
});

export = router;
