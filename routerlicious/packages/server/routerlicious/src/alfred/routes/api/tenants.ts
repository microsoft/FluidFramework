import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";

export function create(config: any, appTenants: IAlfredTenant[]): Router {
    const router: Router = Router();

    router.get("/", (request, response) => {
        const workerConfig = config.get("worker");
        console.log(JSON.stringify(workerConfig, null, 2));
        const blobStorageUrl = workerConfig.blobStorageUrl.replace("historian:3000", "localhost:3001");
        const details = {
            blobStorageUrl,
            id: appTenants[0].id,
            key: appTenants[0].key,
            npm: workerConfig.npm,
        };

        return response.json(details);
    });

    return router;
}
