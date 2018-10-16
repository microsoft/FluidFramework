import * as api from "@prague/runtime-definitions";

/**
 * Datacontract for sharepoint delta feed response
 */
export interface IDeltaFeedResponse {
    opStream: api.ISequencedDocumentMessage[];
}
