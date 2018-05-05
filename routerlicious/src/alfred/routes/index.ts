import * as ensureAuth from "connect-ensure-login";
import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../api-core";
import * as utils from "../../utils";
import { IAlfredTenant } from "../tenant";
import * as agent from "./agent";
import * as api from "./api";
import * as canvas from "./canvas";
import * as cell from "./cell";
import * as demoCreator from "./democreator";
import * as graph from "./graph";
import * as home from "./home";
import * as intelligence from "./intelligence";
import * as maps from "./maps";
import * as ping from "./ping";
import * as scribe from "./scribe";
import * as sharedText from "./sharedText";
import * as signUp from "./signUp";
import * as templates from "./templates";
import * as video from "./video";
import * as youtubeVideo from "./youtubeVideo";

export interface IRoutes {
    agent: Router;
    api: Router;
    canvas: Router;
    cell: Router;
    demoCreator: Router;
    home: Router;
    intelligence: Router;
    signUp: Router;
    maps: Router;
    scribe: Router;
    sharedText: Router;
    video: Router;
    youtubeVideo: Router;
    graph: Router;
    templates: Router;
}

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: utils.MongoManager,
    producer: utils.IProducer,
    appTenants: IAlfredTenant[]) {

    const ensureLoggedIn = config.get("login:enabled") ? ensureAuth.ensureLoggedIn :
        (options) => {
            return (req, res, next) => next();
        };

    return {
        agent: agent.create(config),
        api: api.create(config, tenantManager, mongoManager, producer, appTenants),
        canvas: canvas.create(config, tenantManager, appTenants, ensureLoggedIn),
        cell: cell.create(config, tenantManager, appTenants, ensureLoggedIn),
        demoCreator: demoCreator.create(config, ensureLoggedIn),
        graph: graph.create(config, tenantManager, appTenants, ensureLoggedIn),
        home: home.create(config, ensureLoggedIn),
        intelligence: intelligence.create(config),
        maps: maps.create(config, tenantManager, appTenants, ensureLoggedIn),
        ping: ping.create(),
        scribe: scribe.create(config, tenantManager, appTenants, ensureLoggedIn),
        sharedText: sharedText.create(config, tenantManager, mongoManager, producer, appTenants, ensureLoggedIn),
        singUp: signUp.create(config),
        templates: templates.create(config),
        video: video.create(config, tenantManager, appTenants, ensureLoggedIn),
        youtubeVideo: youtubeVideo.create(config, tenantManager, appTenants, ensureLoggedIn),
    };
}
