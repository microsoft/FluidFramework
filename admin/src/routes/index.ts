import { Router } from "express";
import * as cells from "./cells";
import * as home from "./home";
import * as maps from "./maps";

export interface IRoutes {
    cells: Router;
    home: Router;
    maps: Router;
}

export function create(config: any): IRoutes {

    return {
        cells: cells.create(config),
        home: home.create(config),
        maps: maps.create(config),
    };
}
