import {
    IDeltaStorageService,
    ISequencedDocumentMessage,
} from "@prague/runtime-definitions";

export class TestDeltaStorageService implements IDeltaStorageService {
    public get(
        tenantId: string,
        id: string,
        token: string,
        from?: number,
        to?: number): Promise<ISequencedDocumentMessage[]> {

        return new Promise<ISequencedDocumentMessage[]>((resolve, reject) => {
            resolve([]);
        });
    }
}
