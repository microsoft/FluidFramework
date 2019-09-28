/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Import Fluid Framework "goo":
import {
  PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
 import {
  IComponentHTMLVisual,
  IComponentHandle,
  IComponentHTMLRender,
} from "@microsoft/fluid-component-core-interfaces";
import {
  IComponentContext,
  IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
import {
  SharedString,
} from "@microsoft/fluid-sequence";

// Import parent textarea component:
import {
  TextareaNoReact
} from "@fluid-example/textarea-noreact";

// Import HTML/CSS/Markdown-it:
import * as tabSelector from "./utils/github-missing-js";
import "./styles/github-css-full-rip.css";
const divHTML = require("./styles/github-comment-only.html");
const mdit = require('markdown-it')('commonmark');

export class GithubComment
             extends TextareaNoReact                
             implements IComponentHTMLVisual, IComponentHTMLRender {
  public get IComponentHTMLVisual() { return this; }
  public get IComponentHTMLRender() { return this; }

  /**
   * Extension of the parent class function that also forces the innerHTML of
   * the markdown pane to update based on `nT`.
   */
  protected async forceDOMUpdate(nT, nSS?, nSE?) {
    super.forceDOMUpdate(nT, nSS, nSE);

    const textMarkdownRender = mdit.render(nT) as string;
    const mdDiv =
      document.getElementById("markdown-pane-div") as HTMLDivElement;
    mdDiv.innerHTML = textMarkdownRender;
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
  public async render(div: HTMLElement) {
    this.textareaID = "new_comment_field";

    // Register handlers:
    this.handleIncomingChange = this.handleIncomingChange.bind(this);
    this.handleOutgoingChange = this.handleOutgoingChange.bind(this);
    this.createComponentDom = this.createComponentDom.bind(this);
    this.updateSelection = this.updateSelection.bind(this);
    this.forceDOMUpdate = this.forceDOMUpdate.bind(this);

    // Update textareaState and register listener:
    const textareaString = 
    await this.root.get<IComponentHandle>(this.textareaRootKey)
                   .get<SharedString>();
    this.textareaState.text = textareaString.getText();
    textareaString.on("sequenceDelta", this.handleIncomingChange);

    // Create the component's DOM and add event handlers to textarea:
    div.innerHTML = divHTML;
    const textareaElement =
      document.getElementById(this.textareaID) as HTMLTextAreaElement;
    textareaElement.value = this.textareaState.text;
    textareaElement.oninput = this.handleOutgoingChange;
    textareaElement.selectionStart = this.textareaState.selectionStart;
    textareaElement.selectionEnd = this.textareaState.selectionEnd;
    textareaElement.onclick = this.updateSelection;
    textareaElement.onkeydown = this.updateSelection;

    // Add the missing tab logic back to the tab-container for proper toggling:
    const tabContainer =
      document.getElementById("top-level-tab-container") as HTMLElement;
    tabContainer.onclick = tabSelector.tabHandler;

    // Called here to initialize innerHTML of markdown pane on pageload/refresh:
    this.forceDOMUpdate(this.textareaState.text);
  }

  /**
   * Final (static!) load function that allows the runtime to make async calls
   * while creating the object.
   *
   * Primarily boilerplate code.
   */
  public static async load(runtime: IComponentRuntime,
                           context: IComponentContext): Promise<GithubComment> {
    const fluidComponent =
      new GithubComment(runtime, context);
    await fluidComponent.initialize();

    return fluidComponent;
  }

} // end GithubComment class

/**
 * Note: even though we're extending TextareaNoReact, note that this is a
 * single-line export outside of the class -- we can't even override the
 * equivalent for TextareaNoReact (via importing) and so we have to rewrite
 * essentially the same lines.
 */
export const GithubCommentInstantiationFactory =
  new PrimedComponentFactory(
    GithubComment,
    [
      SharedString.getFactory(),
    ],
);
