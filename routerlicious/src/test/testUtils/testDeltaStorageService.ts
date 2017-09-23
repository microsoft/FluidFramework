import * as api from "../../api";

export class TestDeltaStorageService implements api.IDeltaStorageService {
    public get(id: string, from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return new Promise<api.ISequencedDocumentMessage[]>((resolve, reject) => {
            resolve([]);
        });
    }
}
