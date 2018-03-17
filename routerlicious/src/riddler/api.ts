import { Router } from "express";
import * as jwt from "jsonwebtoken";
import * as winston from "winston";
import { IAuthenticatedUser } from "../core-utils";
import * as utils from "../utils";
import { refreshTenantsFromDb } from "./tenantManager";

interface IDecodedToken {
    user: any;
    tenantid: string;
    secret: string;
    permission: string;
}

async function verifyToken(token: string, hashKey: string, mongoManager: utils.MongoManager,
                           collectionName: string ): Promise<IAuthenticatedUser> {
    return new Promise<IAuthenticatedUser>((resolve, reject) => {
        winston.info(`Token to verify: ${token}`);
        jwt.verify(token, hashKey, (error, decoded: IDecodedToken) => {
            if (error) {
                winston.info(`Token verification error: ${JSON.stringify(error)}`);
                reject(error);
            }
            winston.info(`Decoded token: ${JSON.stringify(decoded)}`);
            refreshTenantsFromDb(mongoManager, collectionName).then((tenantKeyMap: Map<string, string>) => {
                if (!tenantKeyMap.has(decoded.tenantid)) {
                    winston.info(`Invalid tenant name`);
                    reject(`Invalid tenant name`);
                }
                if (tenantKeyMap.get(decoded.tenantid) !== decoded.secret) {
                    winston.info(`Wrong secret key`);
                    reject(`Wrong secret key`);
                }
                resolve({
                    permission: decoded.permission,
                    tenantid: decoded.tenantid,
                    user: decoded.user,
                });
            }, (err) => {
                reject(err);
            });
        });
    });
}

export function create(collectionName: string, mongoManager: utils.MongoManager, hashKey: string): Router {
    const router: Router = Router();

    /**
     * Verifies the passed token and matches with DB.
     */
    router.post("/", (request, response, next) => {
        verifyToken(request.body.token, hashKey, mongoManager, collectionName).then((data: IAuthenticatedUser) => {
            response.status(200).json(data);
        }, (err) => {
            response.status(500).json(err);
        });
    });

    return router;
}
