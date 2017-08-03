import { IObjectStorageService } from "./document";
import { IDocumentStorageService } from "./storage";

export class ObjectStorageService implements IObjectStorageService {
    constructor(private storage: IDocumentStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(path);
    }
}
