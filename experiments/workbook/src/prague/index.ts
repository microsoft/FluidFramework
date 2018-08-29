import * as prague from "../../../../routerlicious/dist";
import api = prague.api.api;
import types = prague.api.types;
import IMapView = prague.api.types.IMapView;
import SharedString = prague.api.SharedString.SharedString;
import mergeTree = prague.api.MergeTree;
import MergeTree = mergeTree.MergeTree;
import Segment = mergeTree.Segment;
import TextSegment = mergeTree.TextSegment;
import UniversalSequenceNumber = mergeTree.UniversalSequenceNumber;
import socketStorage = prague.api.socketStorage;
import * as jwt from "jsonwebtoken";

export {
    IMapView,
    MergeTree,
    Segment,
    SharedString,
    TextSegment,
    UniversalSequenceNumber
};

export async function open(id: string): Promise<api.Document> {
    const routerliciousUrl = "http://localhost:3000";
    const historianUrl = "http://localhost:3001";
    const tenantId = "prague";
    const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
    
    socketStorage.registerAsDefault(routerliciousUrl, historianUrl, tenantId);

    const doc = await api.load(id, {
        blockUpdateMarkers: true,
        token: jwt.sign({
            documentId: id,
            permission: "read:write",
            tenantId,
            user: { id: "danlehen" },
        }, secret)
    });

    await new Promise(resolve => {
        doc.once("connected", () => resolve())
    });

    const rootView = await doc.getRoot().getView();
    if (!doc.existing) {
        rootView.set("created", new Date().toUTCString());
    }

    return doc;
}

export async function upsertMap(document: api.Document, name: string) {
    const root = await document.getRoot();
    const rootView = await root.getView();

    const existing = rootView.get(name);
    if (existing) {
        return { map: existing, view: await (existing as types.IMap).getView()} ;
    }

    const newMap = document.createMap();
    rootView.set(name, newMap);
    return { map: newMap, view: await newMap.getView() };
}