import { Router } from "express";
import * as fs from "fs";
import { Provider } from "nconf";
import * as path from "path";
import { promisify } from "util";
import { defaultPartials } from "./partials";

const readDir = promisify(fs.readdir);

async function getTemplates(): Promise<string[]> {
    const info = await readDir(path.join(__dirname, "../../../public/literature"));
    return info;
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
                response.render(
                    "documents/list",
                    {
                        partials: defaultPartials,
                        templates,
                        title: "Templates",
                    });
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
