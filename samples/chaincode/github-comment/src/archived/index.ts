/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The primary driver file for this component. Written in a barebones style
 * (that makes calls to the ContainerRuntime and other lower-level APIs)
 * rather than the more framework-oriented aqueduct style.
 * 
 * Top-level notes:
 *   * On "fluidExport" - at the end of the day, there needs to be an item named
 *     `fluidExport` that is exported from a component's `index.ts` - it must
 *     refer to that component's "<X>RuntimeFactory" method, as
 *     this is used by convention by the rest of the Fluid "goo". However, there
 *     _is_ a difference in styles between the aqueduct style of having a `main`
 *     that _also_ exports a component's "<X>ComponentFactory" separately. This
 *     difference is purely cosmetic - the latter factory is not used by
 *     default elsewhere and it is up to the programmer to if anything else
 *     needs to be exported for the proper use of the whole component. The more
 *     barebones style convention is to have any important file export be
 *     called a "fluidExport" (since it could conceivably be used elsewhere by
 *     the Fluid framework), but again _by default_ only the final fluidExport
 *     from an `index.ts` matters.
 *
 */

 // Import Fluid "goo" (and some fundamentals):
import { IRequest } from "@prague/component-core-interfaces";
import {
  IContainerContext,
  IRuntime,
  IRuntimeFactory,
} from "@prague/container-definitions";
import { ContainerRuntime } from "@prague/container-runtime";
import {
  IComponentFactory,
} from "@prague/runtime-definitions";

// Import other Fluid components:
import {
  chaincodeName as ctanrRegistryID,
  CollaborativeTextAreaNoReactInstantiationFactory as ctanrComponentFactory,
} from "@chaincode/collaborative-textarea-noreact";

// Import locals:
import { 
  fluidExport as GithubPRCommentComponentFactory
} from "./main";


// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const thisPackageRegistryID = pkg.name as string;
const thisIDUnderContainerRuntime = "default";
const ctanrIDUnderContainerRuntime = "textarea";

/**
 * A factory method for creating _just_ the runtime for this chaincode. This
 * means (only!) defining basic request handling and invoking possible imports
 * needed for the runtime (e.g. in this case, we need to define a role for
 * CollaborativeTextAreaNoReact).
 * 
 * The factory method for the chaincode itself (i.e. the bundle of app logic, 
 * HTML, CSS, etc.) is found, instead, in `main.tsx`.
 */
class GithubPRCommentRuntimeFactory implements IRuntimeFactory {
  public get IRuntimeFactory() { return this; }

  public async instantiateRuntime(
    containerContext: IContainerContext): Promise<IRuntime> {
    // Create a registry for the components that will appear in this container:
    const containerRegistry = new Map<string, Promise<IComponentFactory>>([
      [thisPackageRegistryID, 
       Promise.resolve(GithubPRCommentComponentFactory)],
      [ctanrRegistryID, Promise.resolve(ctanrComponentFactory)], // registers making another component in this container runtime
    ]);

    // Create a request handler for the container runtime that will route
    // requests (in our case, very simply) as necessary to the different
    // components:
    const containerRequestHandler = (runtime: ContainerRuntime) => {
      return async (request: IRequest) => {
        console.log("Container runtime has received a request! ::" + 
                    request.url);

        // Consecutively prune the request URL to figure out the query:
        //
        // Find the root slash of the URL (if it exists)...
        const requestUrl = request.url.length > 0 
                           && request.url.charAt(0) === "/"
          ? request.url.substr(1)
          : request.url;
        const trailingSlash = requestUrl.indexOf("/");
        //
        // Grab the substring containing the particular componentID (or
        // otherwise we will just return a link to the default component)...
        const componentId = requestUrl
            ? requestUrl.substr(0, 
                                trailingSlash === -1 
                                  ? requestUrl.length 
                                  : trailingSlash)
            : thisIDUnderContainerRuntime;
        const component = await runtime.getComponentRuntime(componentId, true);
        //
        // If there was a valid component, then pass the rest of the request URL
        // to it and return it's result (pass the buck along)...
        return component.request({ 
          url: trailingSlash === -1 
            ? "" 
            : requestUrl.substr(trailingSlash + 1) 
        });
      };
    }

    // Declare extra runtime options:
    const containerRuntimeOptions = { generateSummaries: true };
    
    // Load the runtime...
    const loadedContainerRuntime = await ContainerRuntime.load(
      containerContext,
      containerRegistry,
      containerRequestHandler,
      containerRuntimeOptions);
    //
    // And attach each component:
    if (!loadedContainerRuntime.existing) {
      await Promise.all([
        // take this promise, get the shared string
        loadedContainerRuntime
          .createComponent(ctanrIDUnderContainerRuntime, 
                           ctanrRegistryID)
          .then((componentRuntime) => {
            componentRuntime.attach();
        }),
        // hack the result of this, so that it has a way of accepting the shared string
        loadedContainerRuntime
          .createComponent(thisIDUnderContainerRuntime, 
                           thisPackageRegistryID)
          .then((componentRuntime) => {
            componentRuntime.attach();
          }),          
      ]).catch((error) => {
        containerContext.error(error);
      });
    }

    return loadedContainerRuntime;
  }
} // end `GithubCommentRuntimeFactory` class

// Final exports to the rest of Fluid:
//
// The runtime factory for the component:
export const fluidExport = new GithubPRCommentRuntimeFactory();
//
// And direct access to it's `instantiateRuntime`:
export function instantiateRuntime(
  containerContext: IContainerContext): Promise<IRuntime> {
  return fluidExport.instantiateRuntime(containerContext);
}
