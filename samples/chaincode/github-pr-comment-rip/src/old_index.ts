/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  SimpleModuleInstantiationFactory
} from "@prague/aqueduct";

import {
  chaincodeName as CollaborativeTextAreaNoReactName,
  CollaborativeTextAreaNoReactInstantiationFactory,
} from "@chaincode/collaborative-textarea-noreact";

import { 
  GithubPRCommentInstantiationFactory as ComponentInstantiationFactory 
} from "./main";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { ContainerRuntime } from "@prague/container-runtime";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;

/**
 * Going to the source for SimpleModuleInstantiationFactory reveals that its
 * `instantiateRuntime` method is a restrictive call to
 * SimpleContainerRuntimeFactory's so-named method, which creates the runtime
 * context for the chaincode but then _only_ creates one base component.
 * 
 * In order to use two components (in this chaincode, we will compose a version
 * of the Github PR comment on top of CollaborativeTextAreaNoReact), we need to
 * override this instantiation process with our own that will tell the runtime
 * to attach one more component.
 */
class SingleModuleImportInstantiationFactory 
  extends SimpleModuleInstantiationFactory {

  public async instantiateRuntime(
    context: IContainerContext): Promise<IRuntime> {
  
    // Load the runtime (which has already created a base component)
    const runtime = await super.instantiateRuntime(context) as ContainerRuntime;

    // Create some ID for the imported component
    const importedComponentID = "importedComponent";

    // Now add the CollaborativeTextAreaNoReact component
    runtime.createComponent(importedComponentID, 
                            CollaborativeTextAreaNoReactName)
      .then((componentRuntime) => {
        componentRuntime.attach();
      })
      .catch((error) => {
        context.error(error);
      });

    return runtime;
  }
}

/**
 * This does setup for the container. Note the use of the custom factory!
 */
export const fluidExport = new SingleModuleImportInstantiationFactory(
  chaincodeName,
  new Map([
      [chaincodeName, Promise.resolve(ComponentInstantiationFactory)],
      [CollaborativeTextAreaNoReactName,
        Promise.resolve(CollaborativeTextAreaNoReactInstantiationFactory)]
  ]),
);
