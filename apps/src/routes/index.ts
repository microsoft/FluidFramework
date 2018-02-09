import { Router } from "express";
import * as cells from "./cells";
import * as home from "./home";
import * as maps from "./maps";
import * as sharedText from "./sharedText";

export interface IRoutes {
    cells: Router;
    home: Router;
    maps: Router;
    sharedText: Router;
}

export function create(config: any): IRoutes {
    return {
        cells: cells.create(config),
        home: home.create(config),
        maps: maps.create(config),
        sharedText: sharedText.create(config),
    };
}
