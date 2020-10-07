/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import { BlobServiceClient, BlobClient, BlobItem } from "@azure/storage-blob"
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

    public async getSnapShotListForBlobName(containerName: string, blobName: string) {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        const snapShotlist: BlobItem[] = []
        for await (const blobitem of containerClient.listBlobsFlat({ includeSnapshots: true, prefix: blobName })) {
            if (blobitem.name === blobName && blobitem.snapshot) {
                snapShotlist.push(blobitem);
            }
        }
        return snapShotlist;
    }

    public async createSnapShotForBlob(containerName: string, blobName: string) {
        const blockBlobClient = this.getBlockBlobClient(containerName, blobName);
        return blockBlobClient.createSnapshot();
    }

    public async getSnapShotContent(containerName: string, blobName: string, snapshot: string) {
        const blockBlobClient = this.getBlockBlobClient(containerName, blobName);
        const blockBlobSnapshot = blockBlobClient.withSnapshot(snapshot)
        const downloadBlockBlobResponse = await blockBlobSnapshot.download();
        return await this.streamToString(downloadBlockBlobResponse.readableStreamBody);
        // const containerClient = this.blobServiceClient.getContainerClient(containerName);
        // // console.log(containerClient.listBlobsFlat());
        // const x: ContainerListBlobsOptions = { includeSnapshots: true }
        // for await (const container of containerClient.listBlobsFlat(x)) {
        //     console.log(JSON.stringify(container));
        // }
        // const blockBlobClient = this.getBlockBlobClient(containerName, blobName);
        // // const v = await blockBlobClient.stageBlock("SUQ=", "hello", 10);
        // // await blockBlobClient.stageBlock("SURh", "hello world", 15);

        // // const z = await blockBlobClient.commitBlockList(["SUQ=", "SURh"])
        // // console.log(v, y, z);


        // const downloadBlockBlobResponse = await blockBlobClient.getBlockList("all");
        // // console.log(downloadBlockBlobResponse);
        // return downloadBlockBlobResponse;

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