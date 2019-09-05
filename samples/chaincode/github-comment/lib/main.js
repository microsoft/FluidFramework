/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Import Fluid Framework "goo":
import { PrimedComponentFactory, } from "@prague/aqueduct";
import { SharedString, } from "@prague/sequence";
// Import parent textarea component:
import { TextareaNoReact } from "@chaincode/textarea-noreact";
// Import HTML/CSS/Markdown-it:
import * as tabSelector from "./utils/github-missing-js";
import "./styles/github-css-full-rip.css";
const divHTML = require("./styles/github-comment-only.html");
const mdit = require('markdown-it')('commonmark');
export class GithubComment extends TextareaNoReact {
    get IComponentHTMLVisual() { return this; }
    get IComponentHTMLRender() { return this; }
    /**
     * Extension of the parent class function that also forces the innerHTML of
     * the markdown pane to update based on `nT`.
     */
    forceDOMUpdate(nT, nSS, nSE) {
        const _super = Object.create(null, {
            forceDOMUpdate: { get: () => super.forceDOMUpdate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.forceDOMUpdate.call(this, nT, nSS, nSE);
            const textMarkdownRender = mdit.render(nT);
            const mdDiv = document.getElementById("markdown-pane-div");
            mdDiv.innerHTML = textMarkdownRender;
        });
    }
    /**
     * Draw the HTML view of the element. Invoked by the runtime every time the
     * page is loaded/refreshed.
     *
     * In our case, loads the form HTML from an external HTML snippet and then
     * attaches handlers to the core textarea of the comment form.
     *
     * @param div HTMLDivElement provided by runtime for component to be loaded in
     */
    render(div) {
        return __awaiter(this, void 0, void 0, function* () {
            this.textareaID = "new_comment_field";
            // Register handlers:
            this.handleIncomingChange = this.handleIncomingChange.bind(this);
            this.handleOutgoingChange = this.handleOutgoingChange.bind(this);
            this.createComponentDom = this.createComponentDom.bind(this);
            this.updateSelection = this.updateSelection.bind(this);
            this.forceDOMUpdate = this.forceDOMUpdate.bind(this);
            // Update textareaState and register listener:
            const textareaString = yield this.root.get(this.textareaRootKey)
                .get();
            this.textareaState.text = textareaString.getText();
            textareaString.on("sequenceDelta", this.handleIncomingChange);
            // Create the component's DOM and add event handlers to textarea:
            div.innerHTML = divHTML;
            const textareaElement = document.getElementById(this.textareaID);
            textareaElement.value = this.textareaState.text;
            textareaElement.oninput = this.handleOutgoingChange;
            textareaElement.selectionStart = this.textareaState.selectionStart;
            textareaElement.selectionEnd = this.textareaState.selectionEnd;
            textareaElement.onclick = this.updateSelection;
            textareaElement.onkeydown = this.updateSelection;
            // Add the missing tab logic back to the tab-container for proper toggling:
            const tabContainer = document.getElementById("top-level-tab-container");
            tabContainer.onclick = tabSelector.tabHandler;
            // Called here to initialize innerHTML of markdown pane on pageload/refresh:
            this.forceDOMUpdate(this.textareaState.text);
        });
    }
    /**
     * Final (static!) load function that allows the runtime to make async calls
     * while creating the object.
     *
     * Primarily boilerplate code.
     */
    static load(runtime, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const fluidComponent = new GithubComment(runtime, context);
            yield fluidComponent.initialize();
            return fluidComponent;
        });
    }
} // end GithubComment class
/**
 * Note: even though we're extending TextareaNoReact, note that this is a
 * single-line export outside of the class -- we can't even override the
 * equivalent for TextareaNoReact (via importing) and so we have to rewrite
 * essentially the same lines.
 */
export const GithubCommentInstantiationFactory = new PrimedComponentFactory(GithubComment, [
    SharedString.getFactory(),
]);
//# sourceMappingURL=main.js.map