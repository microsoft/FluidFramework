import axios from "axios";
import { Router } from "express";
import * as nconf from "nconf";
import * as winston from "winston";
import { ICache } from "../services";
import { handleResponse } from "./utils";

export function create(store: nconf.Provider, cache: ICache): Router {
    const router: Router = Router();

    async function getContent(path: string): Promise<any> {
        const npmUrl = store.get("npm:url");
        const auth = {
            password: store.get("npm:password"),
            username: store.get("npm:username"),
        };

        const url = `${npmUrl}/${encodeURI(path)}`;
        const details = await axios.get(url, { auth });

        winston.info(JSON.stringify(Object.keys(details.data.versions)));

        return details.data;
    }

    // unpkg.com/:package@:version/:file
    router.get("/*", (request, response) => {
        const contentP = getContent(request.params[0]);
        handleResponse(contentP, response, false);
    });

    return router;
}
