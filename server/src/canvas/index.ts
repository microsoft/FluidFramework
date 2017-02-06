// The main app code
import { Promise } from "es6-promise";
import * as $ from "jquery";
import * as ink from "ot-ink";
import * as sharedb from "sharedb/lib/client";
import BackBoard from "./backBoard";
import Canvas from "./canvas";
import InkCanvas from "./inkCanvas";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

// tslint:disable:no-console

// Register the use of the rich text OT format
sharedb.types.register(ink.type);

// throttle resize events and replace with an optimized version
utils.throttle("resize", "throttled-resize");

// TODO export the ability to get events?

// Open WebSocket connection to ShareDB server
let protocol = window.location.protocol.indexOf("https") !== -1 ? "wss" : "ws";
let socket = new WebSocket(`${protocol}://${window.location.host}`);
let connection = new sharedb.Connection(socket);

export function initialize(id: string) {
    // Load the model from the server
    let doc = connection.get("canvas", id);
    let modelP = new Promise((resolve, reject) => {
        doc.subscribe((err) => {
            console.error("Got the doc");
            if (err) {
                return reject(err);
            }

            // If there is no type we need to create the document
            if (!doc.type) {
                doc.create({ layers: [], layerIndex: {} }, ink.type.name, (createError) => {
                    if (createError) {
                        reject(createError);
                    } else {
                        resolve(doc);
                    }
                });
            } else {
                resolve(doc);
            }
        });
    });

    // Create a promise for when the document is ready
    let documentReadyP = new Promise((resolve, reject) => {
        $("document").ready(() => {
            console.error("Document resolved");
            resolve();
        });
    });

    Promise.all([modelP, documentReadyP]).then((values) => {
        console.error("Both promises resolved");
        let canvas = new Canvas(values[0]);
        let sticky = new StickyNote(utils.id("content"));
        let mainBoard = new BackBoard(canvas, "hitPlane");
        // id("ToolBar").appendChild(new ToolBarButton("images/icons/pencil.svg").click(appObject.clear).elem());
    });
}
