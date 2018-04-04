import { Router } from "express";
import { initAuthChecker } from "./authCheker";
import * as cells from "./cells";
import * as home from "./home";
import * as maps from "./maps";
import * as sharedText from "./sharedText";
import * as tictactoe from "./tictactoe";

export interface IRoutes {
    cells: Router;
    home: Router;
    maps: Router;
    sharedText: Router;
    tittactoe: Router;
}

export function create(config: any): IRoutes {

    // Inits auth checker middleware.
    initAuthChecker(config.tenantInfo);

    return {
        cells: cells.create(config),
        home: home.create(config),
        maps: maps.create(config),
        sharedText: sharedText.create(config),
        tittactoe: tictactoe.create(config),
    };
}
