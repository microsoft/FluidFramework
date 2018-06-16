import * as cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(config: Provider): Router {

    const router: Router = Router();
    const deltasRoute = deltas.create(config);
    const documentsRoute = documents.create(config);

    router.use(cors());
    router.use("/deltas", deltasRoute);
    router.use("/documents", documentsRoute);

    return router;
}
