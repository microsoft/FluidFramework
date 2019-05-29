import { ICell } from "@prague/cell";
import * as API from "@prague/client-api";
import { ISharedMap, IValueChanged } from "@prague/map";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import * as URL from "url-parse";
import { InsecureUrlResolver } from "./urlResolver";

// Using package verions published in 03-04-2019
// For local development
// const routerlicious = "http://localhost:3000";
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

const docId = "cell-map-test-04202019-15";

API.registerDocumentServiceFactory(new RouterliciousDocumentServiceFactory());

async function run(id: string): Promise<void> {
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

    const collabDoc = await API.load(
        documentUrl,
        apiHost);

    const rootMap = await collabDoc.getRoot();

    if (!collabDoc.existing) {
        rootMap.set( "c1", collabDoc.createCell());
        rootMap.set( "m1", collabDoc.createMap());
    } else {
        await Promise.all([rootMap.wait("c1"), rootMap.wait("m1")]);
    }

    const cellEl: ICell = rootMap.get("c1");
    const mapEl: ISharedMap = rootMap.get("m1");

    if (!collabDoc.existing) {
        setInterval(async () => {
            // tslint:disable-next-line:insecure-random
            await cellEl.set(Math.floor(Math.random() * 100000).toString());
            // tslint:disable-next-line:insecure-random
            mapEl.set("foo", Math.floor(Math.random() * 100000).toString());
        }, 5000);
    }

    cellEl.on("valueChanged", (val) => {
        console.log(`New cell value: ${val}`);
    });

    mapEl.on("valueChanged", (mapKey: IValueChanged) => {
        console.log(`New map value: ${mapEl.get(mapKey.key)}`);
    });
}

run(docId).catch((error) => {
    console.error(error);
});
