import { AzureBlobStorage } from "./storageAccount";

import { calculateDeltaBetweenMarkdown, convertToMarkdown, getNodeFromMarkdown } from '../utils';

export interface IStorageUtil {
    getStorageData(): Promise<any>;
    storeData(data: any): void;
    getMardownDataAndConvertIntoNode(schema: any): Promise<any>;
    storeEditorStateAsMarkdown(schema: any, data: any): void;
    storeDeltaChangesOfEditor(schema: any, data: any): void;
    getSnapShotlist() : Promise<any>;
    getSnapShotContent(snapshot: string) : Promise<any>;
}

export class StorageUtil implements IStorageUtil {
    //  private readonly initialVal = "{\"doc\":{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Helllo This is frd\"}]}]},\"selection\":{\"type\":\"text\",\"anchor\":1,\"head\":1}}";
    private readonly storageKey = "FluidPOC_Prosemirror";
    //  private readonly markdownStorageKey = "Markdown_Fluid";
    private azureStorage: AzureBlobStorage;

    constructor(webView?: boolean) {

        // sessionStorage.setItem(this.storageKey, this.initialVal);

        // if (localStorage.getItem(this.markdownStorageKey) === null) {
        //     localStorage.setItem(this.markdownStorageKey, "# Hello World!");
        // }
        this.azureStorage = this.storageAccount(webView);
        console.log(this.azureStorage);
        // this.azureStorage.putBlockBlob("samples", "sampletext.txt", "# Hello World!")
    }

    /**
     * For JSON data
     */

    public getStorageData = async () => {
        let data: any = await this.azureStorage.getBlockBlob("samples", "sampletext.txt"); // await sessionStorage.getItem(this.storageKey);
        return JSON.parse(data);
    }

    public storeData = async (data: any) => {
        console.log("///////// Data writing //////////////");
        console.log(data);
        sessionStorage.setItem(this.storageKey, JSON.stringify(data));
    }
    public storageAccount(webView?: boolean) {
        let sasUrl = undefined;
        if (webView) {
            sasUrl = "https://syncbridge.blob.core.windows.net/?sv=2019-12-12&ss=b&srt=sco&sp=rwdlacx&se=2021-01-01T13:38:22Z&st=2020-10-07T05:38:22Z&spr=https,http&sig=0ytibsrUBKLlPhFCiZG07xuNhOei4pCVsBVC5moF7ZA%3D"
        }
        const azureStorage = new AzureBlobStorage("DefaultEndpointsProtocol=https;AccountName=syncbridge;AccountKey=nSaj5L0vWwWWsl3/7EvScra7LrehlTC/2zDWwY3iJ8ebyGRnNUfKDXo0RtMqAb19oQuJf/7s2AseD7AvUzs40Q==;EndpointSuffix=core.windows.net", sasUrl)
        //const data = await azureStorage.getBlockBlob("samples", "sampletext.txt");
        //console.log(data);
        return azureStorage;
    }
    /**
     * For markdown data
     */

    public getMardownDataAndConvertIntoNode = async (schema: any) => {
        //Gets the mardown and then convert into node data

        //replace the data here
        let data = await this.azureStorage.getBlockBlob("samples", "sampletext.txt"); // localStorage.getItem(this.markdownStorageKey);
        console.log(data);

        let nodeData = await getNodeFromMarkdown(schema, data);

        return nodeData;
    }

    public storeEditorStateAsMarkdown = async (schema: any, data: any) => {
        //get the editor state and convert into markdown
        console.log("changes for the storeEditorStateAsMarkdown", JSON.stringify(data));
        let _t = await convertToMarkdown(data);
        console.log("converted");

        await this.azureStorage.putBlockBlob("samples", "sampletext.txt", _t)
        await this.azureStorage.createSnapShotForBlob("samples", "sampletext.txt");
        // localStorage.setItem(this.markdownStorageKey, _t);
        console.log("///////// Markdown Data writing //////////////");
        console.log(_t);
    }


    public storeDeltaChangesOfEditor = async (schema: any, data: any) => {
        let updatedMarkdown = await convertToMarkdown(data);

        // let oldMarkdown = await this.getMardownDataAndConvertIntoNode(schema);
        let oldMarkdown = "Hello, world!";

        console.log("///////// Markdown Data writing Example //////////////");
        console.log(updatedMarkdown);

        let diff = await calculateDeltaBetweenMarkdown(updatedMarkdown, oldMarkdown);

        console.log(diff);
    }

    public getSnapShotlist() {
        return this.azureStorage.getSnapShotListForBlobName("samples", "sampletext.txt");
    }

    public getSnapShotContent(snapshot: string) {
        return this.azureStorage.getSnapShotContent("samples", "sampletext.txt", snapshot);
    }

}
