import { IDocumentStorageService, IObjectStorageService } from "./storage";

export class ObjectStorageService implements IObjectStorageService {
    constructor(private storage: IDocumentStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(path);
    }
}
