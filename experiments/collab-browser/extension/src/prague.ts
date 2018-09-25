import * as loader from "../../../../routerlicious/packages/loader";
import { WebLoader, WebPlatform } from "../../../../routerlicious/packages/loader-web";
import * as socketStorage from "../../../../routerlicious/packages/socket-storage";
import * as jwt from "jsonwebtoken";
import { Component, componentSym } from "../../component/src/component"

const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

const documentServices = socketStorage.createDocumentService(routerlicious, historian);
const tokenService = new socketStorage.TokenService();

export const load = (documentId: string) => {
    const token = jwt.sign({
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: `browser-${(Math.random() * 0xFFFFFFFF) >>> 0}`,
            },
        },
        secret);

    const webLoader = new WebLoader("http://localhost:4873");

    const platform = new WebPlatform(undefined);
    const componentP = new Promise<Component>((resolver) => {
        platform[componentSym] = resolver;
    });

    loader.load(
        token,
        null,
        platform,
        documentServices,
        webLoader,
        tokenService,
        null,
        true);

    return componentP;
}