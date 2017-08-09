import { IObjectStorageService } from "./document";
import { IDocumentStorageService } from "./storage";

export class ObjectStorageService implements IObjectStorageService {
    constructor(private id: string, private storage: IDocumentStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(`${this.id}/${path}`);
    }
}
