import { Router } from "express";
import * as jwt from "jsonwebtoken";
import * as winston from "winston";
import { IAuthenticatedUser } from "../api-core";
import * as utils from "../utils";
import { refreshTenantsFromDb } from "./tenantManager";

interface IDecodedToken {
    user: any;
    tenantid: string;
    secret: string;
    permission: string;
}

async function getTenantSecret(
    mongoManager: utils.MongoManager,
    collectionName: string,
    tenantId: string): Promise<string> {

    const tenantKeyMap = await refreshTenantsFromDb(mongoManager, collectionName);

    if (!tenantKeyMap.has(tenantId)) {
        return Promise.reject("Invalid tenant name");
    }

    return tenantKeyMap.get(tenantId);
}

async function verifyToken(
    token: string,
    mongoManager: utils.MongoManager,
    collectionName: string): Promise<IAuthenticatedUser> {

    winston.info(`Token to verify: ${token}`);

    const decoded = jwt.decode(token) as IDecodedToken;
    winston.info(`Decoded token: ${JSON.stringify(decoded)}`);

    const secret = await getTenantSecret(mongoManager, collectionName, decoded.tenantid);

    return new Promise<IAuthenticatedUser>((resolve, reject) => {
        jwt.verify(token, secret, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(decoded);
            }
        });
    });
}

export function create(collectionName: string, mongoManager: utils.MongoManager): Router {
    const router: Router = Router();

    /**
     * Verifies the passed token and matches with DB.
     */
    router.post("/", (request, response, next) => {
        verifyToken(request.body.token, mongoManager, collectionName).then((data: IAuthenticatedUser) => {
            response.status(200).json(data);
        }, (err) => {
            response.status(500).json(err);
        });
    });

    return router;
}
