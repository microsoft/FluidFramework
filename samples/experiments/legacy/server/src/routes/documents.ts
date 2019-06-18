/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as express from "express";
import * as documents from "../db/documents";
import { defaultPartials } from "./partials";

let router = express.Router();

router.get("/chart", (request: express.Request, response: express.Response) => {
    response.render(
        "documents/chart",
        {
            partials: defaultPartials,
        });
});

router.get("/calendar", (request: express.Request, response: express.Response) => {
    response.render(
        "documents/calendar",
        {
            partials: defaultPartials,
        });
});

router.get("/:id", (request: express.Request, response: express.Response) => {
    // tslint:disable-next-line:no-string-literal
    let documentId = request.params["id"];
    let documentP = documents.read(documentId);

    documentP.then(
        (document) => {
            response.json(document);
        },
        (error) => {
            response.status(400).json(error);
        });
});

export = router;
