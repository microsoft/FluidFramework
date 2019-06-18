/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as express from "express";
import { defaultPartials } from "./partials";

let router = express.Router();

router.get("/", (req: express.Request, response: express.Response) => {
    response.render(
        "browser",
        {
            partials: defaultPartials,
            user: (<any> req).user,
        });
});

export = router;
