const api = require("@prague/client-api");
const socketStorage = require("@prague/socket-storage");
const MergeTree = require("@prague/merge-tree");
const jwt = require('jsonwebtoken');
const uuidv4 = require('uuid/v4');

const tenantId = "xenodochial-lewin";
const key = "48fb191e6897e15777fbdaa792ce82ee"; // What is this?
const server = "https://alfred.wu2.prague.office-int.com";
const storage = "https://historian.wu2.prague.office-int.com";

function generateToken(tenantId, documentId, key) {
    const userId = uuidv4();
    const claims = {
        documentId,
        permission: "read:write",
        tenantId,
        user: {
            id: userId,
        },
    };

    return jwt.sign(claims, key);
}

/**
 *  @param {string} docId
 *  @param {string} text
 */
exports.setup = async function(docId, text) {
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
        returnBody += "Doc Didn't Exist";
        await root.set("ink", doc.createMap());
        await root.set("pageInk", doc.createStream());
        await root.set("presence", doc.createMap());

    }
    else {
        returnBody += "Doc Existed";
        await Promise.all([root.wait("text"), root.wait("ink")]);

    }

    const ss = await root.get("text");

    let position = 0;
    const lines = text.split("\n");
    ss.insertMarker(0, MergeTree.ReferenceType.Tile, {[MergeTree.reservedTileLabelsKey]: ["pg"] });

    const intervalId = setInterval(async () => {
        if (lines.length === 0) {
            clearInterval(intervalId);
        }
        const line = lines.shift();
        ss.insertText(line, position);
        position += line.length;
        ss.insertMarker(position, MergeTree.ReferenceType.Tile, {[MergeTree.reservedTileLabelsKey]: ["pg"] });
        position += 1;
    }, 5000);

    ss.insertMarker(text.length, MergeTree.ReferenceType.Tile, {[MergeTree.reservedTileLabelsKey]: ["pg"] });

    let keys = lines.length;

    return returnBody + ": " + ss.getText().length + " \nKeys: " + keys + "\n ClientId: " + doc.clientId;
}
