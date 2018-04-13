import { Router } from "express";
import * as dbService from "../db";
import * as home from "./home";
import * as tenants from "./tenants";

export interface IRoutes {
    home: Router;
    tenants: Router;
}

export function create(config: any): IRoutes {

    // Database connection
    const mongoUrl = config.mongo.endpoint as string;
    const mongoFactory = new dbService.MongoDbFactory(mongoUrl);
    const mongoManager = new dbService.MongoManager(mongoFactory);
    const collectionName = config.mongo.collectionNames.tenants;

    return {
        home: home.create(config, mongoManager, collectionName),
        tenants: tenants.create(config, mongoManager, collectionName),
    };
}
