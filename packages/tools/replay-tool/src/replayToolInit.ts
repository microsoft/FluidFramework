import { FileDocumentServiceFactory } from "@prague/file-socket-storage";

/**
 * This will return the File Document Service Factory to be used by the replay tool.
 *
 * @param inDirName - Name of the directory containing the ops/snapshots.
 * @returns File Document Service Factory object.
 */
export async function initializeFileDocumentService(inDirName: string): Promise<FileDocumentServiceFactory> {

    return new FileDocumentServiceFactory(inDirName);
}
