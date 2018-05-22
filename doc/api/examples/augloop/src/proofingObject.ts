/**
 * Schemas and workflows for the Text Analysis/Replace Object scenario.
 */
import {IClientRuntime, ILambda} from "@augloop/runtime-client";
import {inputSchemaName} from "./common";
import {IDocTile} from "./main";

/**
 * String constants
 */
const proofingPackageName = "Proofing.";
const proofingRawInputSchemaName = "ProofingRequest";
const proofingRawOutputSchemaName = "ProofingResponse";
const proofingInputSchemaName = `${proofingPackageName}${proofingRawInputSchemaName}`;
const proofingOutputSchemaName = `${proofingPackageName}${proofingRawOutputSchemaName}`;

/**
 * Given the presentation data in the input tile, constructs a corresponding ProofingRequest
 * for invoking the remote workflow.
 */
const getProofingRequestFromDocument = (docId: string, content: string, reqOrd: number) => {
  const request = {
    documentId: "random-id",
    languageUxId: "en-us",
    runOnProfileId: "{24BCFF65-03B5-40E9-90C8-59B75ABD453D}",
    tiles: [],
  };
  const textTile: any = {};
  textTile.metadata = {
    revisionId: "1",
    tileId: "1",
    tileType: 1,
  };
  textTile.elements = [{
    languageId: "en-us",
    text: content,
    textUnit: 3,
  }];
  request.tiles.push(textTile);
  return request;
};

/**
 * Registers a workflow for the Proofing scenario.
 */
export const registerProofingWorkflow = (runtime: IClientRuntime): Promise<void> => {
  const lambdaBefore: ILambda = {
    func: (input, _config, lambdaDone: (output) => void) => {
        const docTile: IDocTile = input;
        const output = getProofingRequestFromDocument(docTile.docId, docTile.content, docTile.reqOrd);
        lambdaDone(output);
    },
    inputSchema: inputSchemaName,
    name: "ProofingLambdaBefore",
    outputSchema: proofingInputSchemaName,
  };

  const lambdaRemote: ILambda = {
    func: null,
    inputSchema: proofingInputSchemaName,
    name: "ProofingLambdaRemote",
    outputSchema: proofingOutputSchemaName,
  };
  return runtime.registerSimpleRemoteWorkflow("ProofingWorkflow", lambdaBefore, lambdaRemote, null /*lambdaAfter*/);
};
