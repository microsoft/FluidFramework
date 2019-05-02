import {
    IDocumentStorage,
    MongoManager,
} from "@prague/services-core";
import { Router } from "express";
import { Provider } from "nconf";
import * as api from "./api";

export interface IRoutes {
    api: Router;
}

export function create(
    config: Provider,
    mongoManager: MongoManager,
    storage: IDocumentStorage,
) {
    return {
        api: api.create(config, storage, mongoManager),
    };
}
