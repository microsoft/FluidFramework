var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import { DocumentDeltaStorageService, SharepointDeltaStorageService } from "./deltaStorageService";
import { ReplayDocumentStorageService } from "./sharepointDocumentStorageService";
export class SharepointDocumentService {
    constructor(snapshotUrl, deltaFeedUrl, webSocketUrl) {
        this.snapshotUrl = snapshotUrl;
        this.deltaFeedUrl = deltaFeedUrl;
        this.webSocketUrl = webSocketUrl;
        // For now just log the snapshot url until sharepoint starts supporting snapshots
        console.log(this.snapshotUrl);
    }
    connectToStorage(tenantId, id, token) {
        return __awaiter(this, void 0, void 0, function* () {
            // Use the replaydocumentstorage service to return the default values for snapshot methods
            // Replace this once sharepoint starts supporting snapshots
            return new ReplayDocumentStorageService();
        });
    }
    connectToDeltaStorage(tenantId, id, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const deltaStorage = new SharepointDeltaStorageService(this.deltaFeedUrl);
            return new DocumentDeltaStorageService(tenantId, id, token, deltaStorage);
        });
    }
    connectToDeltaStream(tenantId, id, token, client) {
        return __awaiter(this, void 0, void 0, function* () {
            return DocumentDeltaConnection.Create(tenantId, id, token, io, client, this.webSocketUrl);
        });
    }
    branch(tenantId, id, token) {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
    getErrorTrackingService() {
        return null;
    }
}
//# sourceMappingURL=sharepointDocumentService.js.map