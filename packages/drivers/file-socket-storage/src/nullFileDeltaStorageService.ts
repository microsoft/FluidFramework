import * as api from "@prague/container-definitions";

export class NullFileDeltaStorageService implements api.IDocumentDeltaStorageService {

    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
// tslint:disable-next-line: prefer-type-cast
        return Promise.resolve([] as api.ISequencedDocumentMessage[]);
    }
}
