"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const map_1 = require("@prague/map");
const sequence_1 = require("@prague/sequence");
const uuid = require("uuid/v4");
const rootMapId = "root";
/**
 * A document is a collection of collaborative types.
 */
class Document {
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
                root = runtime.createChannel(rootMapId, map_1.MapExtension.Type);
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
        return this.runtime.createChannel(id, map_1.MapExtension.Type);
    }
    createString(id = uuid()) {
        return this.runtime.createChannel(id, sequence_1.SharedStringExtension.Type);
    }
    createChannel(id, type) {
        return this.runtime.createChannel(id, type);
    }
}
exports.Document = Document;
//# sourceMappingURL=document.js.map