var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export { Editor } from "./components/editor";
export { VirtualizedView } from "./components/virtualized";
import { Component } from "@prague/app-component";
import { Scheduler } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { Editor } from "./components/editor";
export class FlowEditor extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }
    opened() {
        return __awaiter(this, void 0, void 0, function* () {
            const maybeDiv = yield this.platform.queryInterface("div");
            if (maybeDiv) {
                const doc = yield this.runtime.openComponent(yield this.root.wait("docId"), true);
                const editor = new Editor();
                const root = editor.mount({ doc, scheduler: new Scheduler(), trackedPositions: [] });
                maybeDiv.appendChild(root);
            }
        });
    }
    create() {
        return __awaiter(this, void 0, void 0, function* () {
            // tslint:disable-next-line:insecure-random
            const docId = Math.random().toString(36).substr(2, 4);
            this.runtime.createAndAttachComponent(docId, "@chaincode/flow-document");
            this.root.set("docId", docId);
        });
    }
}
//# sourceMappingURL=index.js.map