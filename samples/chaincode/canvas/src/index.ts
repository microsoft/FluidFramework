/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document } from "@prague/app-component";
import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import * as querystring from "querystring";

import "./style.less";

export class canvas extends Document {
  // Create the component's schema and perform other initialization tasks
  // (only called when document is initially created).
  protected async create() {
    const params = querystring.parse(window.location.search.substr(1));
    if (params.image) {
      this.root.set("image", params.image);
    }

    this.root.set("ink", this.createStream());
  }

  protected async render(host: HTMLDivElement) {
    const browserHost = new ui.BrowserContainerHost();

    await this.root.wait("ink");

    let image: HTMLImageElement = null;
    if (this.root.has("image")) {
      image = new Image();
      const readyP = new Promise((resolve) => {
        image.onload = resolve;
      });
      image.src = this.root.get("image");
      await readyP;
    }

    const canvas = new controls.FlexView(
      host,
      new api.Document(this.runtime, null, this.root),
      this.root,
      image);
    browserHost.attach(canvas);
  }

  // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
  public async opened() {
    // If the host provided a <div>, render the component into that Div
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      this.render(maybeDiv);
    } else {
      return;
    }
  }
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/canvas", new Map([
    ["@chaincode/canvas", Promise.resolve(Component.createComponentFactory(canvas))],
  ]));
}
