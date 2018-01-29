import { Router } from "express";
import * as jwt from "jsonwebtoken";
import * as utils from "../utils";

interface IDecodedToken {
    user: any;
    tenantid: string;
    secret: string;
    permission: string;
}

// TODO (mdaumi): This map will be populated from mongo.
let tenantKeyMap: { [tenandId: string]: string} = {};
const t1 = "prague";
const t2 = "linkedin";
tenantKeyMap[t1] = "secret_key";
tenantKeyMap[t2] = "secret_key_2";

async function verifyToken(token: string, hashKey: string): Promise<utils.IAuthenticatedUser> {
    return new Promise<utils.IAuthenticatedUser>((resolve, reject) => {
        jwt.verify(token, hashKey, (err, decoded: IDecodedToken) => {
            if (err) {
                reject(err);
            }
            if (tenantKeyMap[decoded.tenantid] !== decoded.secret) {
                reject(`Wrong secret key!`);
            }
            resolve({
                permission: decoded.permission,
                tenantid: decoded.tenantid,
                user: decoded.user,
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
        verifyToken(request.body.token, hashKey).then((data: utils.IAuthenticatedUser) => {
            response.status(200).json(data);
        }, (err) => {
            response.status(500).json(err);
        });
    });

    return router;
}
