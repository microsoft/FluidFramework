/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import { IHook } from "../github";
import { AppendManager } from "../services";

export function create(appendManager: AppendManager): Router {
    const router: Router = Router();

    router.post("/payload", (request, response) => {
        const event = request.headers["x-github-event"] as string;
        const hook = request.body as IHook;
        appendManager.append(event, hook);
        response.status(200).end();
    });

    return router;
}
