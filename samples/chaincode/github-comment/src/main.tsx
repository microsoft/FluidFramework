/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


/******************************************************************************/
// Import the Fluid Framework "goo":
/******************************************************************************/
import {
  // PrimedComponent,
  PrimedComponentFactory,
} from "@prague/aqueduct";
 import {
  IComponentHTMLVisual,
  IComponentHandle,
  IComponentHTMLRender,
} from "@prague/component-core-interfaces";

import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import {
  SharedString,
} from "@prague/sequence";

import {
  TextareaNoReact
} from "@chaincode/textarea-noreact";

//const mdit = require('markdown-it')('commonmark');

import "./github-css-rip-raw.css";
const divHTML = require("./github-comment-html-rip.html");

/******************************************************************************/

/**
 */
export class GithubComment
             extends TextareaNoReact                
             implements IComponentHTMLVisual, IComponentHTMLRender {
  public get IComponentHTMLVisual() { return this; }
  public get IComponentHTMLRender() { return this; }

/******************************************************************************/
// HTML setup and rendering:
/******************************************************************************/

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
    console.log("textarea-noreact: " + this.textareaState.text);

    // Create the component's DOM:
    div.innerHTML = divHTML;
    const textareaElement =
      document.getElementById(this.textareaID) as HTMLTextAreaElement;
    textareaElement.value = this.textareaState.text;
    textareaElement.oninput = this.handleOutgoingChange;
    textareaElement.selectionStart = this.textareaState.selectionStart;
    textareaElement.selectionEnd = this.textareaState.selectionEnd;
    textareaElement.onclick = this.updateSelection;
    textareaElement.onkeydown = this.updateSelection;
  }
/******************************************************************************/


/******************************************************************************/
// Component loading and export:
/******************************************************************************/

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

} // end class

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
/******************************************************************************/
