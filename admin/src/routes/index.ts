import { Router } from "express";
import * as dbService from "../db";
import * as api from "./api";
import * as home from "./home";

export interface IRoutes {
    home: Router;
    api: Router;
}

export function create(config: any): IRoutes {

    // Database connection
    const mongoUrl = config.mongo.endpoint as string;
    const mongoFactory = new dbService.MongoDbFactory(mongoUrl);
    const mongoManager = new dbService.MongoManager(mongoFactory);
    const tenantCollectionName = config.mongo.collectionNames.tenants;
    const userCollectionName = config.mongo.collectionNames.users;
    const orgCollectionName = config.mongo.collectionNames.orgs;

    return {
        api: api.create(config, mongoManager, userCollectionName, orgCollectionName, tenantCollectionName),
        home: home.create(config, mongoManager, userCollectionName, orgCollectionName, tenantCollectionName),
    };
}
