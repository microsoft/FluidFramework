import * as utils from "@prague/services-utils";
import { Response, Router } from "express";
import { Provider } from "nconf";
import { ITenantInput } from "../definitions";
import { TenantManager } from "../tenantManager";

export function create(
    config: Provider,
    mongoManager: utils.MongoManager,
    ensureLoggedIn: any,
    manager: TenantManager,
): Router {
    const router: Router = Router();

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
        const tenantP = manager.addTenant(request.user.oid, tenantInput);
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
