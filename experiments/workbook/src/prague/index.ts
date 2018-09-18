import { IMap, IMapView, CollaborativeMap } from "../../../../routerlicious/packages/map";
import { MergeTree, Segment, TextSegment, UniversalSequenceNumber } from "../../../../routerlicious/packages/merge-tree";
import { SharedString } from "../../../../routerlicious/packages/shared-string";
import * as api from "../../../../routerlicious/packages/client-api";
import * as socketStorage from "../../../../routerlicious/packages/socket-storage";
import * as jwt from "jsonwebtoken";

// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(routerlicious, historian);
api.registerDocumentService(documentServices);

export {
    CollaborativeMap,
    IMapView,
    MergeTree,
    Segment,
    SharedString,
    TextSegment,
    UniversalSequenceNumber
};

export async function open(documentId: string) {
    const token = jwt.sign({
            documentId,
            permission: "read:write",
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const doc = await api.load(documentId, { blockUpdateMarkers: true, token });
    await new Promise(resolve => {
        doc.once("connected", () => resolve())
    });

    const rootView = await doc.getRoot().getView();
    rootView.set("__debug", new Date())

    console.log("Keys");
    console.log(rootView.keys());

    return rootView;
}

export async function upsertMap(document: api.Document, name: string) {
    const root = await document.getRoot();
    const rootView = await root.getView();

    const existing = rootView.get(name);
    if (existing) {
        return { map: existing, view: await (existing as IMap).getView()} ;
    }

    const newMap = document.createMap();
    rootView.set(name, newMap);
    return { map: newMap, view: await newMap.getView() };
}