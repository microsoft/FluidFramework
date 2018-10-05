import { IDocumentDeltaStorageService, ISequencedDocumentMessage } from "@prague/runtime-definitions";

export class ReplayDeltaStorageService implements IDocumentDeltaStorageService {

    public get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        return Promise.resolve([] as ISequencedDocumentMessage[]);
    }
}
