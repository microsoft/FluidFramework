import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { getInitialCode, randomId } from './lib/utils';
import { SharedString } from '@prague/sequence';
import { MonacoCodeEditor } from './ui/monacoCodeEditor';
import { LocalChaincode } from "./ui/localChaincode";

export class FiddleApp extends Document {
  protected async create() {
    // Set the initial app text
    if (!this.runtime.existing) {
      const codeString = this.createString();
      codeString.insertText(getInitialCode(), 0);
      this.root.set("text", codeString);

      this.root.set("documentId", randomId())
    }
  }

  protected async render(host: HTMLDivElement) {
    const text = await this.root.wait<SharedString>("text");

    // styling on the body so we can make this a single page app
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";

    let documentId = randomId();
    ReactDOM.render(
      <div style={{ position: "absolute", left: "0", top: "0", width: "100vw", height: "100vh", overflow: "hidden" }} >
        <MonacoCodeEditor sharedString={text} style={{ width: "50vw", height: "100vh", top: 0, left: 0, position: "absolute" }} />
        {/* <Properties 
          getId={() => documentId}
          setId = {(newId) => documentId = newId}
          style={{ width: "50vw", height: "10vh", bottom: 0, left: 0, position: "absolute", borderTop: "1px dotted darkgray" }}/> */}
        <LocalChaincode
          getText={() => text.getText()}
          getDocumentId={() => documentId}
          onLoad={this.connected}
          style={{ width: "50vw", height: "50vh", top: 0, right: 0, position: "absolute" }}
          iframeId="div1" />
        <LocalChaincode
          getText={() => text.getText()}
          getDocumentId={() => documentId}
          onLoad={this.connected}
          style={{ width: "50vw", height: "50vh", bottom: 0, right: 0, position: "absolute" }}
          iframeId="div2" />
      </div>,
      host
    );
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      this.render(maybeDiv);
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/fiddle-app", [
    ["@chaincode/fiddle-app", Promise.resolve(FiddleApp)]
  ]);
}