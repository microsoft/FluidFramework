/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import { ISharedMap, IValueChanged } from "@prague/map";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import * as commander from "commander";
import * as URL from "url-parse";
import { InsecureUrlResolver } from "./urlResolver";

// Using package verions published in 03-04-2019
// For local development
// const routerlicious = "http://localhost:3003";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "gallant-hugle";
// const secret = "03302d4ebfb6f44b662d00313aff5a46";
const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
// Use undefined for only subscribing to the ordering service.
const historian = undefined;
const tenantId = "stupefied-kilby";
const secret = "4a9211594f7c3daebca3deb8d6115fe2";

const userId = "test";

API.registerDocumentServiceFactory(new RouterliciousDocumentServiceFactory());

async function run(id: string, mode: "readonly" | undefined): Promise<void> {
    const deltaUrl = routerlicious + `/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`;
    const resolver = new InsecureUrlResolver(
        routerlicious,
        deltaUrl,
        historian,
        userId,
        secret);

    const documentUrl = `prague://${new URL(routerlicious).host}` +
        `/${encodeURIComponent(tenantId)}` +
        `/${encodeURIComponent(id)}`;
    const apiHost = { resolver };

    console.log(`Loading ${documentUrl}`);
    const collabDoc = await API.load(
        documentUrl,
        apiHost,
        { blockUpdateMarkers: true, client: { mode } });
    console.log(`Done loading`);

    const rootMap = await collabDoc.getRoot();
    console.log(`RootMap loaded`);

    if (!collabDoc.existing) {
        console.log(`New document`);
        rootMap.set( "m1", collabDoc.createMap());
    } else {
        console.log(`Existing document`);
        await Promise.all([rootMap.wait("m1")]);
    }

    const mapEl: ISharedMap = rootMap.get("m1");
    const clientMode = mode ? mode : "regular";

    setInterval(async () => {
        const val = Math.floor(Math.random() * 100000).toString();
        console.log(`${clientMode} writing ${val}`);
        // tslint:disable-next-line:insecure-random
        mapEl.set("foo", `${clientMode}: ${val}`);
    }, 5000);

    mapEl.on("valueChanged", (mapKey: IValueChanged) => {
        console.log(`${clientMode} reading ${mapEl.get(mapKey.key)}`);
    });
}

// Process command line input
let action = false;
commander
    .option("-m, --mode [tenant]", "Mode", undefined)
    .arguments("<documentId>")
    .action((documentId) => {
        action = true;
        run(documentId, commander.mode).catch((error) => {
            console.error(error);
        });

    })
    .parse(process.argv);

if (!action) {
    commander.help();
}
