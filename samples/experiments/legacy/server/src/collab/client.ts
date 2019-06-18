/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ink from "ot-ink";
import * as json from "ot-json0";
import * as richText from "rich-text";
import * as sharedb from "sharedb/lib/client";

// Register our OT types
sharedb.types.register(ink.type);
sharedb.types.register(json.type);
sharedb.types.register(richText.type);
sharedb.types.register(ink.nocompose);

let protocol = window.location.protocol.indexOf("https") !== -1 ? "wss" : "ws";

/**
 * Open WebSocket connection to ShareDB server
 */
export function connect(): any {
    let socket = new WebSocket(`${protocol}://${window.location.host}`);
    let connection = new sharedb.Connection(socket);

    return connection;
}

export let types = {
    ink,
    json,
    richText,
};

// For testing reconnection
// (<any> window).disconnect = () => {
//     connection.close();
// };

// (<any> window).connect = () => {
//     let webSocket = new WebSocket("ws://" + window.location.host);
//     connection.bindToSocket(webSocket);
// };
