import * as $ from "jquery";
import * as api from "../../api";
import * as ink from "../../ink";
import * as socketStorage from "../../socket-storage";
import { Canvas, throttle } from "../canvas";

socketStorage.registerAsDefault(document.location.origin);

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id);

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
throttle("resize", "throttled-resize");

let canvas: Canvas;

export async function initialize(id: string) {
    const doc = await loadDocument(id);
    const root = doc.getRoot();

    let ink: ink.IInk;
    if (await root.has("ink")) {
        ink = await root.get("ink") as ink.IInk;
    } else {
        ink = doc.createInk() as ink.IInk;
        root.set("ink", ink);
    }

    $("document").ready(() => {
        canvas = new Canvas(ink);
    });
}
