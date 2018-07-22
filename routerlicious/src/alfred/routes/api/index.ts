import * as cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { IDocumentStorage, ITenantManager } from "../../../core";
import * as utils from "../../../utils";
import { IAlfredTenant } from "../../tenant";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    storage: IDocumentStorage,
    mongoManager: utils.MongoManager,
    producer: utils.IProducer,
    appTenants: IAlfredTenant[]): Router {

    const router: Router = Router();
    const deltasRoute = deltas.create(config, mongoManager, appTenants);
    const documentsRoute = documents.create(storage, appTenants);

    router.use(cors());
    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);

    return router;
}
