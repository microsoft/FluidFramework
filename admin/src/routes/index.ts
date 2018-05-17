import * as utils from "@prague/routerlicious/dist/utils";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";
import * as home from "./home";

export interface IRoutes {
    home: Router;
    api: Router;
}

export function create(config: Provider, mongoManager: utils.MongoManager): IRoutes {

    // Database connection
    const tenantCollectionName = config.get("mongo:collectionNames:tenants");
    const userCollectionName = config.get("mongo:collectionNames:users");
    const orgCollectionName = config.get("mongo:collectionNames:orgs");

    return {
        api: api.create(config, mongoManager, userCollectionName, orgCollectionName, tenantCollectionName),
        home: home.create(config, mongoManager, userCollectionName, orgCollectionName, tenantCollectionName),
    };
}
