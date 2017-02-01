// The main app code
import * as $ from "jquery";
import * as otInk from "ot-ink";
import * as sharedb from "sharedb/lib/client";
import BackBoard from "./backBoard";
import Canvas from "./canvas";
import InkCanvas from "./inkCanvas";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

// tslint:disable:no-console

// Register the use of the rich text OT format
sharedb.types.register(otInk.type);

// throttle resize events and replace with an optimized version
utils.throttle("resize", "throttled-resize");

// TODO export the ability to get events?

export function initialize(id: string) {
    // Open WebSocket connection to ShareDB server
    let protocol = window.location.protocol.indexOf("https") !== -1 ? "wss" : "ws";
    let socket = new WebSocket(`${protocol}://${window.location.host}`);
    let connection = new sharedb.Connection(socket);
    let doc = connection.get("canvas", id);

    // create the new app
    $("document").ready(() => {
        let canvas = new Canvas();

        let sticky = new StickyNote(utils.id("content"));
        let mainBoard = new BackBoard(canvas, "hitPlane");
        // id("ToolBar").appendChild(new ToolBarButton("images/icons/pencil.svg").click(appObject.clear).elem());

        doc.subscribe((err) => {
            if (err) {
                throw err;
            }

            // If there is no type we need to create the document
            if (!doc.type) {
                console.log("Creating new document");
                doc.create("Hello", otInk.type.name);
            }

            console.log(doc.data);

            // To write more data
            doc.submitOp(
                { position: 3, text: "World, " },
                { source: canvas });

            doc.on("op", (op, source) => {
                if (source === canvas) {
                    return;
                }

                // Update the canvas
            });
        });
    });
}
