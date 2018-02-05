import * as cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../../api-core";
import * as utils from "../../../utils";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer): Router {

    const router: Router = Router();
    const deltasRoute = deltas.create(config, mongoManager);
    const documentsRoute = documents.create(config, tenantManager, mongoManager, producer);

    router.use(cors());
    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);

    return router;
}
