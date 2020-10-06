import { AzureBlobStorage } from "./storageAccount";

import {calculateDeltaBetweenMarkdown, convertToMarkdown, getNodeFromMarkdown} from '../utils';

export interface IStorageUtil {
    getStorageData(): Promise<any>;
    storeData(data: any): void;
    getMardownDataAndConvertIntoNode(schema: any): Promise<any>;
    storeEditorStateAsMarkdown(schema: any, data: any): void;
    storeDeltaChangesOfEditor(schema: any, data: any): void;
}

export class StorageUtil implements IStorageUtil {
    //  private readonly initialVal = "{\"doc\":{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Helllo This is frd\"}]}]},\"selection\":{\"type\":\"text\",\"anchor\":1,\"head\":1}}";
    private readonly storageKey = "FluidPOC_Prosemirror";
    //  private readonly markdownStorageKey = "Markdown_Fluid";
    private azureStorage: AzureBlobStorage;

    constructor() {
        // sessionStorage.setItem(this.storageKey, this.initialVal);

        // if (localStorage.getItem(this.markdownStorageKey) === null) {
        //     localStorage.setItem(this.markdownStorageKey, "# Hello World!");
        // }
        this.azureStorage = this.storageAccount();
        console.log(this.azureStorage);
        this.azureStorage.putBlockBlob("samples", "sampletext.txt", "# Hello World!")
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
    public storageAccount() {
        const azureStorage = new AzureBlobStorage("DefaultEndpointsProtocol=https;AccountName=prosemirror;AccountKey=5LkbRyZcII5Tq6r2sjCB95vNbFOswTlJ8ZvmN5HJtEmPusAG4e8SfpWit0npF25/bT9SLZKrKT1Xq/DC/GSRRg==;EndpointSuffix=core.windows.net")
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

        let nodeData = await getNodeFromMarkdown(schema,data);

        return nodeData;
    }

    public storeEditorStateAsMarkdown = async (schema: any, data: any) => {
        //get the editor state and convert into markdown
        let _t = convertToMarkdown(data);
        this.azureStorage.putBlockBlob("samples", "sampletext.txt", _t)
        // localStorage.setItem(this.markdownStorageKey, _t);
        console.log("///////// Markdown Data writing //////////////");
        console.log(_t);
    }


    public storeDeltaChangesOfEditor = async (schema: any, data: any) => {
        let updatedMarkdown = await convertToMarkdown(data);

        //let oldMarkdown = await this.getMardownDataAndConvertIntoNode(schema);
        let oldMarkdown = "Hello, world!";

        console.log("///////// Markdown Data writing Example //////////////");
        console.log(updatedMarkdown);

        let diff = await calculateDeltaBetweenMarkdown(updatedMarkdown, oldMarkdown);

        console.log(diff);
    }

}