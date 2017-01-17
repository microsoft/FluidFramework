import * as express from "express";
import * as ShareDB from "sharedb";
import { defaultPartials } from "./partials";

let share = new ShareDB();

let router = express.Router();

router.get("/:id", (req: express.Request, response: express.Response) => {
    // tslint:disable-next-line:no-string-literal
    let sync = req.query["sync"] || true;
    response.render(
        "collab",
        {
            // tslint:disable-next-line:no-string-literal
            id: req.params["id"],
            partials: defaultPartials,
            sync,
        });
});

export = router;
