import { Router } from "express";
import * as fs from "fs";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as path from "path";
import { promisify } from "util";
import { defaultPartials } from "./partials";

const readDir = promisify(fs.readdir);

interface ITemplate {
    ext: string;
    full: string;
    name: string;
}

async function getTemplates(): Promise<ITemplate[]> {
    // Empty template for starting with a blank document
    const result: ITemplate[] = [{
        ext: null,
        full: "empty",
        name: "empty",
    }];

    // Load in stored templates
    const info = await readDir(path.join(__dirname, "../../public/literature"));
    const templates = info.map((name) => {
        const parsed = path.parse(name);
        return {
            ext: parsed.ext,
            full: name,
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
                    });
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
