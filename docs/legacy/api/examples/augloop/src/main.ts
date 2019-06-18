/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Workflow configuration logics for augmentation loop run-time for PowerPoint.
 */
import {IClientRuntime} from "@augloop/runtime-client";
import {inputSchemaName} from "./common";
import {registerProofingWorkflow} from "./proofingObject";

/**
 * Registers schemas for the app-specific input data.
 */
function registerInputSchemas(runtime: IClientRuntime): Promise<void> {
  const inputProto =
    `syntax = "proto3";
    message ${inputSchemaName} {
      string documentId = 1;
      string content = 2;
      uint32 reqOrd = 3;
      uint32 requestTime = 4;
    }`;
  return runtime.registerSchemas(inputProto, [inputSchemaName]);
}

/**
 * Registers all workflows for PowerPoint augmentation loop integration.
 */
function registerWorkflows(runtime: IClientRuntime): Promise<void> {
  return registerProofingWorkflow(runtime);
}

/**
 * Top-level function for registering the necessary schemas and workflows
 * for augmentation loop integration in PowerPoint.
 */
export function configureRuntimeForWorkflows(runtime: IClientRuntime): Promise<void> {
  return registerInputSchemas(runtime).then(() => {
    return registerWorkflows(runtime);
  });
}
