import * as api from "@prague/container-definitions";

export class ReplayDeltaStorageService implements api.IDocumentDeltaStorageService {

    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return Promise.resolve([] as api.ISequencedDocumentMessage[]);
    }
}
