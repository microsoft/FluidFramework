// import * as API from "@prague/client-api";
import { FileDocumentServiceFactory } from "@prague/file-socket-storage";

export async function initializeFileDocumentService(filename: string, from: number, to: number) {

    // const fileDocumentServiceFactory: FileDocumentServiceFactory =
    //     new FileDocumentServiceFactory(filename);
    // return fileDocumentServiceFactory;
    // API.registerDocumentServiceFactory(fileDocumentServiceFactory);
    return new FileDocumentServiceFactory(filename);
}
