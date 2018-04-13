import { Router } from "express";
import * as dbService from "../db";
import * as data from "./dataUtil";

export function create(config: any, mongoManager: dbService.MongoManager, collectionName: string): Router {
    const router: Router = Router();

    router.post("/add", async (request, response, next) => {
        const tenant = request.body.tenant;
        data.addTenant(mongoManager, collectionName, tenant).then((result) => {
            response.status(200).json(result.ops[0]);
        }, (error) => {
            response.status(500).json(error);
        });
    });

    router.post("/delete/:id", async (request, response, next) => {
        const tenantId = request.params.id;
        data.deleteTenant(mongoManager, collectionName, tenantId).then((result) => {
            response.status(200).json(result.result.n);
        }, (error) => {
            response.status(500).json(error);
        });
    });

    router.get("/:tenantId", async (request, response, next) => {
        data.findTenant(mongoManager, collectionName, request.params.tenantId).then((result) => {
            response.status(200).json(result);
        }, (error) => {
            response.status(500).json(error);
        });
    });

    return router;
}
