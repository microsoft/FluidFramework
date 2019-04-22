var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { MapExtension } from "@prague/map";
import { SharedStringExtension } from "@prague/sequence";
import * as uuid from "uuid/v4";
const rootMapId = "root";
/**
 * A document is a collection of collaborative types.
 */
export class Document {
    /**
     * Constructs a new document from the provided details
     */
    constructor(runtime, root) {
        this.runtime = runtime;
        this.root = root;
    }
    static Load(runtime) {
        return __awaiter(this, void 0, void 0, function* () {
            let root;
            if (!runtime.existing) {
                root = runtime.createChannel(rootMapId, MapExtension.Type);
                root.attach();
            }
            else {
                root = (yield runtime.getChannel("root"));
            }
            const document = new Document(runtime, root);
            return document;
        });
    }
    /**
     * Flag indicating whether the document already existed at the time of load
     */
    get existing() {
        return this.runtime.existing;
    }
    getRoot() {
        return this.root;
    }
    createMap(id = uuid()) {
        return this.runtime.createChannel(id, MapExtension.Type);
    }
    createString(id = uuid()) {
        return this.runtime.createChannel(id, SharedStringExtension.Type);
    }
    createChannel(id, type) {
        return this.runtime.createChannel(id, type);
    }
}
//# sourceMappingURL=document.js.map