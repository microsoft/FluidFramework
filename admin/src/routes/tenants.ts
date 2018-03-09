import { Router } from "express";
import * as dbService from "../db";
import * as data from "./dataUtil";

export function create(config: any, mongoManager: dbService.MongoManager, collectionName: string): Router {
    const router: Router = Router();

    router.post("/", async (request, response, next) => {
        const tenant = request.body.tenant;
        data.addTenant(mongoManager, collectionName, tenant).then((result) => {
            response.status(200).json(result.ops[0]);
        }, (error) => {
            response.status(500).json(error);
        });
    });

    return router;
}
