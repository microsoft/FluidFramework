import { IComponentRuntime } from "@prague/runtime-definitions";
import { ConfigKeys } from "./configKeys";
import { Template } from "@prague/flow-util";
import { IMap } from "@prague/map";

export const cellRangeExpr = /([a-zA-Z]+)(\d+):([a-zA-Z]+)(\d+)/;

const template = new Template({
    tag: "form",
    children: [
        { tag: "caption", children: [{ tag: "span", ref: "captionTitle" }] },
        {
            tag: "tfoot",
            children: [
                { tag: "button", ref: "createButton", props: { textContent: "Create" } },
                { tag: "button", ref: "okButton", props: { textContent: "Ok" } }
            ]
        },
        {
            tag: "table",
            props: { action: "demo" },
            children: [
                { tag: "caption", children: [{ tag: "span", props: { textContent: "Table-Slice Configuration" } }]},
                { tag: "tfoot", children: [{ tag: "input", props: { type: "submit" }}]},
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "docId" } },
                        { tag: "td", children: [{ tag: "input", ref: "idBox", props: { value: `Untitled-${Math.random().toString(36).substr(2, 6)}` } }] },
                    ]
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "Server" } },
                        { tag: "td", children: [{ tag: "input", ref: "serverBox", props: { value: "https://alfred.wu2-ppe.prague.office-int.com" } }] },
                    ]
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "userId" } },
                        { tag: "td", children: [{ tag: "input", ref: "userBox", props: { value: "anonymous-coward" } }] },
                    ]
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "header" }},
                        { tag: "td", children: [{ 
                            tag: "input",
                            ref: "headerBox",
                            props: {
                                type: "text",
                                value: "A2:A5",
                                pattern: `${cellRangeExpr.source}`,
                                title: "Cell range must be in the form 'RC:RC' (e.g., 'A1:F6')" }
                        }]},
                    ]
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "values" }},
                        { tag: "td", children: [{ 
                            tag: "input",
                            ref: "valuesBox",
                            props: {
                                type: "text",
                                value: "E2:E5",
                                pattern: `${cellRangeExpr.source}`,
                                title: "Cell range must be in the form 'RC:RC' (e.g., 'A1:F6')" }
                        }]},
                    ]
                }
            ]
        }
    ]
});

export class ConfigView {
    public readonly root = template.clone();
    private readonly caption    = template.get(this.root, "captionTitle") as HTMLElement;
    private readonly idBox      = template.get(this.root, "idBox") as HTMLInputElement;
    private readonly serverBox  = template.get(this.root, "serverBox") as HTMLInputElement;
    private readonly userBox    = template.get(this.root, "userBox") as HTMLInputElement;
    private readonly valuesBox  = template.get(this.root, "valuesBox") as HTMLInputElement;
    private readonly headerBox  = template.get(this.root, "headerBox") as HTMLInputElement;
    private readonly okButton   = template.get(this.root, "okButton") as HTMLButtonElement;
    private readonly createButton   = template.get(this.root, "createButton") as HTMLButtonElement;

    public readonly done: Promise<void>;

    constructor (private readonly runtime: IComponentRuntime, private readonly map: IMap) {
        this.caption.innerText = `Table Slice ${this.runtime.id}`;

        this.done = new Promise<void>(accept => {
            this.createButton.addEventListener("click", () => {
                this.runtime.createAndAttachProcess(this.idBox.value, "@chaincode/table-document");
                this.map.set(ConfigKeys.docId, this.idBox.value);
                accept();
            });

            this.okButton.addEventListener("click", () => {
                this.map.set(ConfigKeys.serverUrl, this.serverBox.value);
                this.map.set(ConfigKeys.userId, this.userBox.value);
                this.map.set(ConfigKeys.headerText, this.headerBox.value);
                this.map.set(ConfigKeys.valuesText, this.valuesBox.value);
                this.map.set(ConfigKeys.docId, this.idBox.value);
                accept();
            });

            this.map.wait(ConfigKeys.docId).then(() => {
                accept();
            });
        });
        
        if (new URL(window.location.href).hostname === "localhost") {
            this.serverBox.value = "http://localhost:3000";
        }
    }
}
