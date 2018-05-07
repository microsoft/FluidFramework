import { Response, Router } from "express";
import * as core from "../db";
import { ITenantInput } from "../definitions";
import { TenantManager } from "./tenantManager";

export function create(config: any, mongoManager: core.MongoManager, userCollectionName: string,
                       orgCollectionName: string, tenantCollectionName: string): Router {
    const router: Router = Router();
    const manager = new TenantManager(mongoManager, userCollectionName, orgCollectionName,
                                      tenantCollectionName, config.riddlerUrl, config.gitUrl, config.cobaltUrl);

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
