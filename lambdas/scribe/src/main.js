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

    const doc = await api.load(docId, claims.tenantId, claims.user, new socketStorage.TokenProvider(token), { });
    const root = await doc.getRoot().getView();
    var ss;

    var returnBody = "";

    if (!doc.existing){
        await root.set("text", doc.createString());
        returnBody += "Doc Didn't Exist";
    }
    else {
        returnBody += "Doc Existed";
    }

    ss = await root.wait("text");

    return returnBody + ": " + ss.getText().length;
}
 