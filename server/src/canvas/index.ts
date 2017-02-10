// The main app code
import { Promise } from "es6-promise";
import * as $ from "jquery";
import * as collabClient from "../collab/client";
import BackBoard from "./backBoard";
import Canvas from "./canvas";
import InkCanvas from "./inkCanvas";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

// throttle resize events and replace with an optimized version
utils.throttle("resize", "throttled-resize");

let connection = collabClient.connect();

export function initialize(id: string) {
    // Load the model from the server
    let doc = connection.get("canvas", id);
    let modelP = new Promise((resolve, reject) => {
        doc.subscribe((err) => {
            if (err) {
                return reject(err);
            }

            // If there is no type we need to create the document
            if (!doc.type) {
                doc.create({ layers: [], layerIndex: {} }, collabClient.types.ink.type.name, (createError) => {
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
            resolve();
        });
    });

    Promise.all([modelP, documentReadyP]).then((values) => {
        let canvas = new Canvas(connection, id, values[0]);
        let sticky = new StickyNote(utils.id("content"));
        let mainBoard = new BackBoard(canvas, "hitPlane");
    });
}
