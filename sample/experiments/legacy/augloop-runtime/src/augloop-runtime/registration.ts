/**
 * Workflow configuration logics for augmentation loop run-time.
 */
import {IClientRuntime} from "@augloop/runtime-client";
import {registerProofingWorkflow} from "./proofingObject";
import {inputSchemaName} from "./schema";

/**
 * Registers schemas for the app-specific input data.
 */
function registerInputSchemas(runtime: IClientRuntime): Promise<void> {
  const inputProto =
    `syntax = "proto3";
    message ${inputSchemaName} {
      string documentId = 1;
      uint32 begin = 2;
      uint32 end = 3;
      string content = 4;
      uint32 reqOrd = 5;
      uint32 requestTime = 6;
    }`;
  return runtime.registerSchemas(inputProto, [inputSchemaName]);
}

/**
 * Top-level function for registering the necessary schemas and workflows
 * for augmentation loop integration.
 */
export function configureRuntimeForWorkflows(runtime: IClientRuntime): Promise<void> {
  return registerInputSchemas(runtime).then(() => {
    return registerProofingWorkflow(runtime);
  });
}
