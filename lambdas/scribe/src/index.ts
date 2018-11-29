import * as api from "@prague/client-api";
import * as socketStorage from "@prague/socket-storage";
import { ITokenClaims } from "@prague/runtime-definitions";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid";

const tenantId = "xenodochial-lewin";
const docId = "test";
const key = "48fb191e6897e15777fbdaa792ce82ee"; // What is this?
const server = "https://alfred.wu2.prague.office-int.com";
const storage = "https://historian.wu2.prague.office-int.com";

function generateToken(tenantId: string, documentId: string, key: string): string {
    const userId = uuid.v4();
    const claims: ITokenClaims = {
        documentId,
        permission: "read:write",
        tenantId,
        user: {
            id: userId,
        },
    };

    return jwt.sign(claims, key);
}

function setup(): Promise<api.Document>  {
    const token = generateToken(tenantId, docId, key );

    // Load the shared string extension we will type into
    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);
    const documentService = socketStorage.createDocumentService(server, storage);
    api.registerDocumentService(documentService);

    return api.load(docId, claims.tenantId, claims.user, new socketStorage.TokenProvider(token), { });

}
exports.handler = function(context, event) {
    const documentP = setup();
    // const documentP = api.load(docId, claims.tenantId, claims.user, new socketStorage.TokenProvider(token), { });
    documentP
    .then(() => {
        context.callback(docId);
    })
    .catch(() => {
        context.callback('Error');
    })
};
