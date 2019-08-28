/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 /**
  * The app logic and runtime creation factory for this component.
  * 
  * Top-level notes:
  *   * In some sense, the chain-of-command of this component is messy since
  *     GithubPRComment itself does not do anything extra in collaborative
  *     functionality or even in general app features (i.e. it just provides
  *     some interesting markdown/formatting on top of
  *     CollaborativeTextAreaNoReact). 
  *   *
  */

 // Import Fluid "goo" (and some fundamentals):
import {
  IComponentLoadable,
  IComponentRouter,
  IRequest,
  IResponse,
  IComponentHTMLOptions,
  IComponentHTMLVisual,
//  IComponentHandle,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedMap, SharedMap } from "@prague/map";
import { 
  IComponentContext, 
  IComponentFactory, 
  IComponentRuntime 
} from "@prague/runtime-definitions";
// import { SharedString } from "@prague/sequence";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import { CollaborativeTextAreaNoReact } from "@chaincode/collaborative-textarea-noreact";

// Import other Fluid components:
//import * as SimpleMDE from "simplemde";
// import {
//   CollaborativeTextAreaNoReact
// } from "@chaincode/collaborative-textarea-noreact"

// Import locals:
//import 'simplemde/dist/simplemde.min.css';

export class GithubPRComment 
  extends EventEmitter 
  implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {
  
  // Fluid goo and boilerplate:
  public url: string;
  //
  public get IComponentLoadable() { return this; }
  public get IComponentRouter() { return this; }
  public get IComponentHTMLVisual() { return this; }
  //
  public static async load(componentRuntime: IComponentRuntime, 
                           componentContext: IComponentContext) {
    const componentInstance = 
      new GithubPRComment(componentRuntime, componentContext);
    await componentInstance.initialize(componentContext);
    return componentInstance;
  }
  //
  /**
   * Handle IRequest from container. (In this case just a simple ack and return
   * of this component class instance.)
   * 
   * @param request Incoming request from the container runtime
   */
  public async request(request: IRequest): Promise<IResponse> {
    // TODO: Should I add in more handling to pass to textareea? Or in this case
    // is textarea its own thing that you can request without going through
    // GithubPRComment?
    console.log("incoming request to GithubPRComment from container!")
    return {
        mimeType: "prague/component",
        status: 200,
        value: this,
    };
  }

  // Private variables for app logic:
  private root: ISharedMap;
  private ctanr: CollaborativeTextAreaNoReact;

  /**
   * Basic constructor that sets the URL for the component.
   * 
   * @param runtime runtime allocated to component by the container
   * @param context context allocated to component by the container
   */
  constructor(private runtime: IComponentRuntime, context: IComponentContext) {
    super();
    this.url = context.id;
  }

//   protected async getComponent<T>(id: string, wait: boolean = true): Promise<T> {
//     const request = {
//         headers: [[wait]],
//         url: `/${id}`,
//     };

//     return this.asComponent(this.context.hostRuntime.request(request));
// }
// private async asComponent<T>(response: Promise<IResponse>): Promise<T> {
//   const result = await response;

//   if (result.status === 200 && result.mimeType === "prague/component") {
//       return result.value as T;
//   }

//   return Promise.reject("response does not contain prague component");
// }

  /**
   * Helper method to initialize environment for the app logic. Creates the
   * root map and a local reference to the textarea component.
   * 
   * @param componentContext context allocated by the container
   */
  private async initialize(componentContext: IComponentContext) {
    console.log("initialize");
    if (!this.runtime.existing) {
        this.root = SharedMap.create(this.runtime, "root");

        this.root.register();
    }

    this.root = await this.runtime.getChannel("root") as ISharedMap;

    // Ask the container runtime for a ref. to the textarea component:
    const containerRequest = {
      url: "/textarea", 
    }
    const containerResponse = 
      await componentContext.hostRuntime.request(containerRequest);
    if (containerResponse.status === 200 
        && containerResponse.mimeType === "prague/component") {
      this.ctanr = containerResponse.value as CollaborativeTextAreaNoReact;
//      await this.ctanr.componentHasInitialized();
      console.log("got here so thats good");
    }
    else {
      console.log("ruh roh, raggy!");
    }
  }

  public async render(elm: HTMLElement, options?: IComponentHTMLOptions) {
    console.log("render call");
    console.log(this.ctanr);
  //  await this.ctanr.render(elm);
  }
} // end class GithubPRComment

class GithubPRCommentFactory implements IComponentFactory {
  public get IComponentFactory() { return this; }

  public instantiateComponent(context: IComponentContext): void {
    console.log("inside instantComponent");
      // Declare necessary distributed data structures:
    const dataTypes = new Map<string, ISharedObjectFactory>();
    const mapFactory = SharedMap.getFactory();

    dataTypes.set(mapFactory.type, mapFactory);
    
    // Declare the callback to load the runtime for the component:
    const loadComponentRuntime = (runtime: ComponentRuntime) => {
      // The component's own runtime also needs a request handler:
      runtime.registerRequestHandler(async (request: IRequest) => {
        const loadedComponent = await GithubPRComment.load(runtime, context);
        return loadedComponent.request(request);
      });
    };

    // Final component load:
    ComponentRuntime.load(
      context,
      dataTypes,
      loadComponentRuntime
    );
  }
} // end class GithubPRCommentFactory

// Final exports to the rest of Fluid:
//
// The component factory for this component:
export const fluidExport = new GithubPRCommentFactory();
//
// And direct access to it's `instantiateComponent`: (Why? I'm not sure, but
// this is the pattern).
export function instantiateComponent(context: IComponentContext): void {
  fluidExport.instantiateComponent(context);
}
