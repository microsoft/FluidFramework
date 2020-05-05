/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const api = require("@fluid-internal/client-api");
const socketStorage = require("@prague/socket-storage");
const MergeTree = require("@microsoft/fluid-merge-tree");
const jwt = require('jsonwebtoken');
const sharedString = require("@prague/shared-string")
const uuidv4 = require('uuid/v4');

const tenantId = "happy-chatterjee"; // "xenodochial-lewin";
const key = "8f69768d16e3852bc4b938cdaa0577d1"; // "48fb191e6897e15777fbdaa792ce82ee"; // What is this?
const server = "https://alfred.wu2.prague.office-int.com";
const storage = "https://historian.wu2.prague.office-int.com";

/**
 *  @param {string} docId
 *  @param {string} text
 *  @param {number} time
 *  @param {string} startMarker
 */
exports.setup = async function(docId, text, time, startMarker) {
    const token = generateToken(tenantId, docId, key );

    // Load the shared string extension we will type into
    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);
    const documentService = socketStorage.createDocumentService(server, storage);
    api.registerDocumentService(documentService);

    const doc = await api.load(docId, claims.tenantId, claims.user, new socketStorage.TokenProvider(token), { blockUpdateMarkers: true, token });
    const root = await doc.getRoot().getView();

    var returnBody = "";

    if (!doc.existing){
        await root.set("text", doc.createString());
        returnBody += "Doc Didn't Exist\n";
        await root.set("presence", doc.createMap());
    }
    else {
        returnBody += "Doc Existed\n";
        await Promise.all([root.wait("text")]);
    }

    const ss = await root.get("text");

    let position = ss.getText().length; // getPos(ss, paragraphKey);
    const lines = text.split("\n");
    const chars = text.split("");

    ss.insertMarker(position, MergeTree.ReferenceType.Tile, {
        [MergeTree.reservedMarkerIdKey]: ["startMarker"],
        [MergeTree.reservedTileLabelsKey]: ["pg"] 
    });

    const intervalId = setInterval((async () => {
        if (chars.length === 0) {
            clearInterval(intervalId);
        }
        const char = chars.shift();
        if (char === "\n") {
            ss.insertMarker(position, MergeTree.ReferenceType.Tile, {
                [MergeTree.reservedTileLabelsKey]: ["pg"] 
            });
        } else {
            ss.insertText(position, char);
        }
        position++;
    }), time);

    ss.insertMarker(text.length, MergeTree.ReferenceType.Tile, {[MergeTree.reservedTileLabelsKey]: ["pg"] });

    let keys = lines.length;

    return returnBody + ": " + ss.getText().length + " \nKeys: " + keys + "\nstartMarker: " + getPos(ss, "p-0") + "\nClientId: " + doc.clientId;
}

/**
 * 
 * @param {sharedString.SharedString} ss 
 * @param {string} paragraphKey 
 * @returns {number}
 */
function getPos(ss, paragraphKey) {
    const relPosit = {
        before: true,
        id: paragraphKey,
        offset: 0,
    };
    return ss.client.mergeTree.posFromRelativePos(relPosit);
}

/**
 * 
 * @param {string} tenantId 
 * @param {string} documentId 
 * @param {string} key 
 * @returns {string}
 */
function generateToken(tenantId, documentId, key) {
    const userId = uuidv4();
    const claims = {
        documentId,
        tenantId,
        user: {
            id: userId,
        },
    };

    return jwt.sign(claims, key);
}
