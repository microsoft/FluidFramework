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
      uint32 docId = 1;
      string id = 2;
      string content = 3;
      uint32 reqOrd = 4;
      uint32 requestTime = 5;
    }`;
  return runtime.registerSchemas(inputProto, [inputSchemaName]);
}

/**
 * Slide tile is the input data we submit to the augmentation loop.
 */
export interface IDocTile {
  /**
   * Runtime document ID.
   */
  docId: string;

  /**
   * ID of this page.
   */
  id: string;

  /**
   * Content of this slide tile in JSON format.
   */
  content: string;

  /**
   * Request order sequence number.
   */
  reqOrd: number;

  /**
   * Request timestamp in milliseconds that have elapsed since January 1, 1970 at 00:00:00 UTC.
   */
  requestTime: number;
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
export function configureRuntimeForPowerPointWorkflows(runtime: IClientRuntime): Promise<void> {
  return registerInputSchemas(runtime).then(() => {
    return registerWorkflows(runtime);
  });
}
