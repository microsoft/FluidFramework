import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import jwt from "jsonwebtoken";
import { getContainer } from "./getContainer";
class SimpleUrlResolver {
    constructor(containerId, config, user) {
        this.containerId = containerId;
        this.config = config;
        this.user = user;
        this.token = jwt.sign({
            user,
            documentId: containerId,
            tenantId: config.tenantId,
            scopes: ["doc:read", "doc:write", "summary:write"],
        }, config.key);
    }
    async resolve(request) {
        const documentUrl = `${this.config.orderer}/${this.config.tenantId}/${request.url}`;
        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${this.config.orderer}/deltas/${this.config.tenantId}/${request.url}`,
                ordererUrl: `${this.config.orderer}`,
                storageUrl: `${this.config.storage}/repos/${this.config.tenantId}`,
            },
            tokens: { jwt: this.token },
            type: "fluid",
            url: documentUrl,
        });
    }
    async getAbsoluteUrl(resolvedUrl, relativeUrl) {
        if (resolvedUrl.type !== "fluid") {
            throw Error("Invalid Resolved Url");
        }
        return `${resolvedUrl.url}/${relativeUrl}`;
    }
}
/**
 * Connect to an implementation of the Routerlicious service and retrieve a Container with
 * the given ID running the given code.
 *
 * @param containerId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 * @param createNew - Is this a new container
 * @param config
 */
export async function getRouterliciousContainer(containerId, containerRuntimeFactory, createNew, config) {
    const user = {
        id: "unique-id",
        name: "Unique Idee",
    };
    const tokenProvider = new InsecureTokenProvider(config.key, user);
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    const urlResolver = new SimpleUrlResolver(containerId, config, user);
    return getContainer(containerId, createNew, { url: containerId }, urlResolver, documentServiceFactory, containerRuntimeFactory);
}
//# sourceMappingURL=getRouterliciousContainer.js.map