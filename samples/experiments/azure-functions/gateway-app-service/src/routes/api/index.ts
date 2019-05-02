import { IAlfredTenant } from "@prague/services-core";
import * as cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";

export function create(
    config: Provider,
    appTenants: IAlfredTenant[]): Router {

    const router: Router = Router();
    const apiRoute = api.create(config, appTenants);

    router.use(cors());
    router.use("/api/v1", apiRoute);

    return router;
}
