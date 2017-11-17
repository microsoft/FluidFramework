import * as cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as git from "../../../git-storage";
import * as utils from "../../../utils";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
    config: Provider,
    gitManager: git.GitManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer): Router {

    const router: Router = Router();
    const deltasRoute = deltas.create(config, mongoManager);
    const documentsRoute = documents.create(config, gitManager, mongoManager, producer);

    router.use(cors());
    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);

    return router;
}
