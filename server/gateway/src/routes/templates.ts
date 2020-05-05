/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { getUserDetails, getVersion } from "../utils";
import { defaultPartials } from "./partials";

const readDir = promisify(fs.readdir);

interface ITemplate {
    ext: string | null;
    full: string | null;
    name: string;
}

async function getTemplates(): Promise<ITemplate[]> {
    // Empty template for starting with a blank document
    const result: ITemplate[] = [{
        // eslint-disable-next-line no-null/no-null
        ext: null,
        // eslint-disable-next-line no-null/no-null
        full: null,
        name: "empty",
    }];

    // Load in stored templates
    const info = await readDir(path.join(__dirname, "../../public/literature"));
    const templates = info.map((name) => {
        const parsed = path.parse(name);
        return {
            ext: parsed.ext,
            full: `&template=${name}`,
            name: parsed.name,
        };
    });

    return result.concat(templates);
}

export function create(config: Provider): Router {
    const router: Router = Router();

    /**
     * Route to retrieve the home page for the app
     */
    router.get("/list", (request, response, next) => {
        const templatesP = getTemplates();
        templatesP.then(
            (templates) => {
                const documentId = moniker.choose();
                response.render(
                    "documents/list",
                    {
                        documentId,
                        partials: defaultPartials,
                        templates,
                        title: "Templates",
                        user: getUserDetails(request),
                        version: getVersion(),
                    });
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
