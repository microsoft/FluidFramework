var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Document storage service for sharepoint...For now, this is just a placeholder
 * It just does a default implememtation for all the methods
 */
export class ReplayDocumentStorageService {
    getSnapshotTree(version) {
        return null;
    }
    getVersions(sha, count) {
        return __awaiter(this, void 0, void 0, function* () {
            return [];
        });
    }
    read(sha) {
        return __awaiter(this, void 0, void 0, function* () {
            return "";
        });
    }
    getContent(version, path) {
        return __awaiter(this, void 0, void 0, function* () {
            return "";
        });
    }
    write(tree, parents, message) {
        return null;
    }
    createBlob(file) {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
    getRawUrl(sha) {
        return null;
    }
}
//# sourceMappingURL=sharepointDocumentStorageService.js.map