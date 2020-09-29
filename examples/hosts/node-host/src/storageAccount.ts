
import { BlobServiceClient, BlobClient } from "@azure/storage-blob"
// import { v4 as uuid } from "uuid";

export class AzureBlobStorage {

    private blobServiceClient: BlobServiceClient;

    constructor(AZURE_STORAGE_CONNECTION_STRING: string) {
        this.blobServiceClient = this.getBlobServiceClient(AZURE_STORAGE_CONNECTION_STRING)
    }

    public getBlobClient(blobUrl: string) {
        return new BlobClient(blobUrl)
    }

    public getBlobServiceClient(AZURE_STORAGE_CONNECTION_STRING: string) {
        return BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

    }

    public getBlockBlobClient(containerName: string, blobName: string) {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        // Get a block blob client
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        return blockBlobClient
    }

    public async putBlockBlob(containerName: string, blobName: string, data: any) {
        const blockBlobClient = this.getBlockBlobClient(containerName, blobName);
        const uploadBlobResponse = await blockBlobClient.upload(data, data.length);
        console.log("Blob was uploaded successfully. requestId: ", uploadBlobResponse.requestId);
        return uploadBlobResponse

    }

    public async getBlockBlob(containerName: string, blobName: string) {
        const blockBlobClient = this.getBlockBlobClient(containerName, blobName);
        const downloadBlockBlobResponse = await blockBlobClient.download();
        return await this.streamToString(downloadBlockBlobResponse.readableStreamBody);

    }


    private streamToString(readableStream) {
        return new Promise((resolve, reject) => {
            const chunks: any = [];
            readableStream.on("data", (data) => {
                chunks.push(data.toString());
            });
            readableStream.on("end", () => {
                resolve(chunks.join(""));
            });
            readableStream.on("error", reject);
        });
    }



}