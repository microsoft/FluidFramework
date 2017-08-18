import * as express from "express";
import { defaultPartials } from "./partials";

// simpler code path and module not setup for import
// tslint:disable-next-line:no-var-requires
let ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn;

let router = express.Router();

router.get("/", ensureLoggedIn(), (req: express.Request, response: express.Response) => {
    response.render(
        "loader",
        {
            partials: defaultPartials,
            user: (<any> req).user,
        });
});

export = router;
