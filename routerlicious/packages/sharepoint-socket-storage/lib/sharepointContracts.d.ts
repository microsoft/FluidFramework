import * as api from "@prague/runtime-definitions";
/**
 * Datacontract for sharepoint delta feed response
 */
export interface ISequencedDocumentOp {
    op: api.ISequencedDocumentMessage;
    sequenceNumber: number;
}
export interface IDeltaFeedResponse {
    value: api.ISequencedDocumentMessage[] | ISequencedDocumentOp[];
}
