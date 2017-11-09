import { Router } from "express";
import { Provider } from "nconf";
import * as git from "../../git-storage";
import * as utils from "../../utils";
import * as api from "./api";
import * as canvas from "./canvas";
import * as cell from "./cell";
import * as demoCreator from "./democreator";
import * as home from "./home";
import * as intelligence from "./intelligence";
import * as login from "./login";
import * as maps from "./maps";
import * as ping from "./ping";
import * as scribe from "./scribe";
import * as sharedText from "./sharedText";
import * as templates from "./templates";

export interface IRoutes {
    api: Router;
    canvas: Router;
    cell: Router;
    demoCreator: Router;
    home: Router;
    intelligence: Router;
    login: Router;
    maps: Router;
    scribe: Router;
    sharedText: Router;
    templates: Router;
}

export function create(
    config: Provider,
    gitManager: git.GitManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer) {

    return {
        api: api.create(config, gitManager, mongoManager, producer),
        canvas: canvas.create(config, gitManager),
        cell: cell.create(config, gitManager),
        demoCreator: demoCreator.create(config),
        home: home.create(config),
        intelligence: intelligence.create(config),
        login: login.create(config),
        maps: maps.create(config, gitManager),
        ping: ping.create(),
        scribe: scribe.create(config),
        sharedText: sharedText.create(config, gitManager),
        templates: templates.create(config),
    };
}
