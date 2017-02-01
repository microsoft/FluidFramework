import * as express from "express";
import { defaultPartials } from "./partials";

let router = express.Router();

router.get("/:id", (req: express.Request, response: express.Response) => {
    // tslint:disable-next-line:no-string-literal
    let id = req.params["id"];

    response.render(
        "canvas",
        {
            id,
            partials: defaultPartials,
            title: `Canvas - ${id}`,
        });
});

export = router;
