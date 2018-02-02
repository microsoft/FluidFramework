import { Router } from "express";
import { Provider } from "nconf";
import * as cells from "./cells";
import * as maps from "./maps";

export interface IRoutes {
    cells: Router;
    maps: Router;
}

export function create(config: Provider): IRoutes {
    return {
        cells: cells.create(config),
        maps: maps.create(config),
    };
}
