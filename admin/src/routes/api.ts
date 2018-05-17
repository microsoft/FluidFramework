import * as utils from "@prague/routerlicious/dist/utils";
import { Response, Router } from "express";
import { Provider } from "nconf";
import { ITenantInput } from "../definitions";
import { TenantManager } from "./tenantManager";

export function create(config: Provider, mongoManager: utils.MongoManager, userCollectionName: string,
                       orgCollectionName: string, tenantCollectionName: string): Router {
    const router: Router = Router();
    const manager = new TenantManager(
        mongoManager,
        userCollectionName,
        orgCollectionName,
        tenantCollectionName,
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
    router.post("/tenants", (request, response) => {
        const tenantInput = request.body as ITenantInput;
        const tenantP = manager.addTenant(request.user.oid, tenantInput);
        returnResponse(tenantP, response);
    });

    /**
     * Creates an existing tenant
     */
    router.delete("/tenants/:id", (request, response) => {
        const tenantP = manager.deleteTenant(request.params.id);
        returnResponse(tenantP, response);
    });

    return router;
}
