import { api, ui } from "routerlicious";
import * as d3 from "d3";
import * as querystring from "querystring";
import * as request from "request";
import * as path from "path";
import { Graph } from "./graph";
import * as $ from "jquery";

import prague = api;
import types = api.types;

const routerliciousEndpoint = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

prague.socketStorage.registerAsDefault(routerliciousEndpoint, historian, repository);

async function instantiate() {
    const docid = "monster5";

    const collabDoc = await prague.api.load(docid, { blockUpdateMarkers: true, encrypted: false });
    const rootView = await collabDoc.getRoot().getView();
    
    const host = new ui.ui.BrowserContainerHost();

    let graphMap: types.IMap;

    if (!rootView.has("graph")) {
        graphMap = collabDoc.createMap();
		rootView.set("graph", graphMap);
	} else {
		graphMap = rootView.get("graph");
    }

    let graphElement = new Graph($("#graph-div")[0] as HTMLDivElement, graphMap);
    console.log(graphElement.element);

    host.attach(graphElement);
}

// https://stackoverflow.com/questions/37656592/define-global-variable-with-webpack
(<any>window).instantiate = instantiate;
