import {MarkdownParser, defaultMarkdownSerializer} from "prosemirror-markdown"
import markdownit from "markdown-it"

export interface IStorageUtil {
    getStorageData() : Promise<any>;
    storeData(data : any) : void;
    getMardownDataAndConvertIntoNode(schema: any): Promise<any>;
    storeEditorStateAsMarkdown(schema: any,data : any): void;
}

export class StorageUtil implements IStorageUtil{
    private readonly initialVal = "{\"doc\":{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Helllo This is frd\"}]}]},\"selection\":{\"type\":\"text\",\"anchor\":1,\"head\":1}}";
    private readonly storageKey = "FluidPOC_Prosemirror";
    private readonly markdownStorageKey = "Markdown_Fluid";

    constructor(){
        sessionStorage.setItem(this.storageKey, this.initialVal);
        
        if(localStorage.getItem(this.markdownStorageKey) === null){
            localStorage.setItem(this.markdownStorageKey, "# Hello World!");
        }
    }

    /**
     * For JSON data
     */

    public getStorageData = async () => {
        let data = await sessionStorage.getItem(this.storageKey);
        return JSON.parse(data);
    }

    public storeData = async (data: any) => {
        console.log("///////// Data writing //////////////");
        console.log(data);
        sessionStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    /**
     * For markdown data
     */

    public getMardownDataAndConvertIntoNode = async (schema: any) => {
        //Gets the mardown and then convert into node data

        //replace the data here
        let data = await localStorage.getItem(this.markdownStorageKey);
        console.log(data);


        let _markdownParser = new MarkdownParser(schema,markdownit("commonmark", {html: false}),{
            blockquote: {block: "blockquote"},
            paragraph: {block: "paragraph"},
            list_item: {block: "list_item"},
            bullet_list: {block: "bullet_list"},
            ordered_list: {block: "ordered_list", getAttrs: tok => ({order: +tok.attrGet("start") || 1})},
            heading: {block: "heading", getAttrs: tok => ({level: +tok.tag.slice(1)})},
            code_block: {block: "code_block", noCloseToken: true},
            fence: {block: "code_block", getAttrs: tok => ({params: tok.info || ""}), noCloseToken: true},
            hr: {node: "horizontal_rule"},
            image: {node: "image", getAttrs: tok => ({
              src: tok.attrGet("src"),
              title: tok.attrGet("title") || null,
              alt: tok.children[0] && tok.children[0].content || null
            })},
            hardbreak: {node: "hard_break"},
          
            em: {mark: "em"},
            strong: {mark: "strong"},
            link: {mark: "link", getAttrs: tok => ({
              href: tok.attrGet("href"),
              title: tok.attrGet("title") || null
            })},
            code_inline: {mark: "code", noCloseToken: true}
          });

        let nodeData = _markdownParser.parse(data);

        return nodeData;
    }

    public storeEditorStateAsMarkdown = async (schema: any, data: any) => {
        //get the editor state and convert into markdown
        let _t = defaultMarkdownSerializer.serialize(data);
        localStorage.setItem(this.markdownStorageKey, _t);
        console.log("///////// Markdown Data writing //////////////");
        console.log(_t);
    }
}