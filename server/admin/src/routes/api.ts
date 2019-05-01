import * as core from "@prague/services-core";
import { Response, Router } from "express";
import { Provider } from "nconf";
import { IPackage, ITenantInput } from "../definitions";
import { PackageManager } from "../packageManager";
import { TenantManager } from "../tenantManager";

export function create(
    config: Provider,
    mongoManager: core.MongoManager,
    ensureLoggedIn: any,
    tenantManager: TenantManager,
    packageManager: PackageManager,
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
        const tenantP = tenantManager.addTenant(request.user.oid, tenantInput);
        returnResponse(tenantP, response);
    });

    /**
     * Deletes an existing tenant
     */
    router.delete("/tenants/:id", ensureLoggedIn(), (request, response) => {
        const tenantP = tenantManager.deleteTenant(request.params.id);
        returnResponse(tenantP, response);
    });

    /**
     * Creates a new package
     */
    router.post("/packages", ensureLoggedIn(), (request, response) => {
        const packageInput = request.body as IPackage;
        const newPackage = packageManager.addPackage(packageInput);
        response.status(200).json(newPackage);
    });

    /**
     * Deletes an existing package
     */
    router.delete("/packages/:id", ensureLoggedIn(), (request, response) => {
        const packageId = packageManager.removePackage(request.params.id);
        response.status(200).json(packageId);
    });

    return router;
}
