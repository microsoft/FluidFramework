import * as api from "@prague/client-api";
import { SharepointDocumentService } from "./sharepointDocumentService";
export function load(snapshotUrl, deltaFeedUrl, webSocketUrl, id, tenantId, user, tokenProvider, options = {}, version = null, connect = true) {
    const documentService = createSharepointDocumentService(snapshotUrl, deltaFeedUrl, webSocketUrl);
    return api.load(id, tenantId, user, tokenProvider, options, version, connect, documentService);
}
function createSharepointDocumentService(snapshotUrl, deltaFeedUrl, webSocketUrl) {
    const service = new SharepointDocumentService(snapshotUrl, deltaFeedUrl, webSocketUrl);
    return service;
}
//# sourceMappingURL=registration.js.map