import * as api from "@prague/runtime-definitions";
import { ISequencedDocumentMessage } from "@prague/runtime-definitions";

export class ReplayDeltaStorageService implements api.IDocumentDeltaStorageService {

    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return Promise.resolve([] as ISequencedDocumentMessage[]);
    }
}
