import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import * as fs from "fs";
import { FileDocumentService } from "./fileDocumentService";

export class FileDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private fileName: string) {}

    public async createDocumentService(fileURL: IResolvedUrl): Promise<IDocumentService> {
        if (fs.existsSync(this.fileName)) {
            return new FileDocumentService(this.fileName);
        } else {
            return Promise.reject("File does not exist");
        }
    }
}
