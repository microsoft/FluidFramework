/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
  PrimedComponent,
  SimpleComponentInstantiationFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
  SharedMap,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

// import {
//   CollaborativeTextAreaNoReact
// } from "@chaincode/collaborative-textarea-noreact";

export class GithubPRComment extends PrimedComponent implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() { return this; }
  public get IComponentHTMLRender() { return this; }

  private textareaLoadable: any;

  constructor(runtime, context) {
    super(runtime, context);

    this.textareaLoadable = undefined;
  }
  protected async create() {
    await super.create();
  }

  protected async opened() {
    this.textareaLoadable = await this.getComponent("importedComponent");
  }

  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<GithubPRComment> {
    const app = new GithubPRComment(runtime, context);
    await app.initialize();
    return app;
  }

 
  public async render(div: HTMLElement) {
    // Do initial setup off the provided div.
    this.createComponentDom(div);


    const childDiv: HTMLDivElement = document.createElement("div");
    div.appendChild(childDiv);


//    const textarea = await this.getComponent("importedComponent");
//    textarea.IComponentHTMLRender.render(childDiv);
    this.textareaLoadable.IComponentHTMLRender.render(childDiv);
  }

  private createComponentDom(host: HTMLElement) {
    const title: HTMLHeadingElement = document.createElement("h1");
    title.textContent = "Here's a title!";

    host.appendChild(title);
  }

}

export const GithubPRCommentInstantiationFactory = new SimpleComponentInstantiationFactory(
  [
    SharedMap.getFactory(),
  ],
  GithubPRComment.load
);
