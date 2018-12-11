import {
    IDeltaStorageService,
    ISequencedDocumentMessage,
    ITokenProvider,
} from "@prague/runtime-definitions";

export class TestDeltaStorageService implements IDeltaStorageService {
    public get(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider,
        from?: number,
        to?: number): Promise<ISequencedDocumentMessage[]> {

        return new Promise<ISequencedDocumentMessage[]>((resolve, reject) => {
            resolve([]);
        });
    }
}
