import { Router } from "express";
import { Provider } from "nconf";
import * as git from "../../git-storage";
import * as utils from "../../utils";
import * as canvas from "./canvas";
import * as cell from "./cell";
import * as deltas from "./deltas";
import * as demoCreator from "./democreator";
import * as documents from "./documents";
import * as home from "./home";
import * as intelligence from "./intelligence";
import * as login from "./login";
import * as maps from "./maps";
import * as ping from "./ping";
import * as scribe from "./scribe";
import * as sharedText from "./sharedText";
import * as video from "./video";

export interface IRoutes {
    canvas: Router;
    cell: Router;
    deltas: Router;
    demoCreator: Router;
    documents: Router;
    home: Router;
    intelligence: Router;
    login: Router;
    maps: Router;
    scribe: Router;
    sharedText: Router;
    video: Router;
}

export function create(config: Provider, gitManager: git.GitManager, mongoManager: utils.MongoManager) {
    return {
        canvas: canvas.create(config, gitManager),
        cell: cell.create(config, gitManager),
        deltas: deltas.create(config, mongoManager),
        demoCreator: demoCreator.create(config),
        documents: documents.create(config),
        home: home.create(config),
        intelligence: intelligence.create(config),
        login: login.create(config),
        maps: maps.create(config, gitManager),
        ping: ping.create(),
        scribe: scribe.create(config),
        sharedText: sharedText.create(config, gitManager),
        video: video.create(config, gitManager),
    };
}
