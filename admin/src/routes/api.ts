import * as utils from "@prague/routerlicious/dist/utils";
import { Response, Router } from "express";
import { Provider } from "nconf";
import { ITenantInput } from "../definitions";
import { TenantManager } from "./tenantManager";

export function create(config: Provider, mongoManager: utils.MongoManager, ensureLoggedIn: any): Router {
    const router: Router = Router();
    const manager = new TenantManager(
        mongoManager,
        config.get("mongo:collectionNames:users"),
        config.get("mongo:collectionNames:orgs"),
        config.get("mongo:collectionNames:tenants"),
        config.get("app:riddlerUrl"),
        config.get("app:gitUrl"),
        config.get("app:cobaltUrl"));

    function returnResponse<T>(resultP: Promise<T>, response: Response) {
        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(error.toString()));
    }

    /**
     * Creates a new tenant
     */
    router.post("/tenants", ensureLoggedIn(), (request, response) => {
        const tenantInput = request.body as ITenantInput;
        const tenantP = manager.addTenant(request.user.toString(), tenantInput);
        returnResponse(tenantP, response);
    });

    /**
     * Creates an existing tenant
     */
    router.delete("/tenants/:id", ensureLoggedIn(), (request, response) => {
        const tenantP = manager.deleteTenant(request.params.id);
        returnResponse(tenantP, response);
    });

    return router;
}
