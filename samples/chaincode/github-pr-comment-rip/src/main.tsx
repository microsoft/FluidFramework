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
  IComponentHandle,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedMap, SharedMap } from "@prague/map";
import { 
  IComponentContext, 
  IComponentFactory, 
  IComponentRuntime 
} from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { EventEmitter } from "events";

// Import other Fluid components:
//import * as SimpleMDE from "simplemde";

// Import locals:
//import 'simplemde/dist/simplemde.min.css';

export class GithubPRComment 
  extends EventEmitter 
  implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {

  public get IComponentLoadable() { return this; }
  public get IComponentRouter() { return this; }
  public get IComponentHTMLVisual() { return this; }

  public static async load(componentRuntime: IComponentRuntime, 
                           componentContext: IComponentContext) {
      const collection = 
        new GithubPRComment(componentRuntime, componentContext);
      await collection.initialize();

      return collection;
  }

  public url: string;
  private root: ISharedMap;
  // private text: SharedString;
  // private textArea: HTMLTextAreaElement;

  constructor(private runtime: IComponentRuntime, context: IComponentContext) {
      super();

      this.url = context.id;
  }

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

  private async initialize() {
      if (!this.runtime.existing) {
          this.root = SharedMap.create(this.runtime, "root");
          const text = SharedString.create(this.runtime);

          this.root.set("text", text.handle);
          this.root.register();
      }

      this.root = await this.runtime.getChannel("root") as ISharedMap;
      this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();
  }

  public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {

  }

  // private setupEditor() {

  // }
} // end class GithubPRComment

class GithubPRCommentFactory implements IComponentFactory {
  public get IComponentFactory() { return this; }

  public instantiateComponent(context: IComponentContext): void {
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
// And direct access to it's `instantiateComponent`:
export function instantiateComponent(context: IComponentContext): void {
  fluidExport.instantiateComponent(context);
}
