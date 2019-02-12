import { Template } from "@prague/flow-util";
import { ISharedMap } from "@prague/map";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { ConfigKeys } from "./configKeys";

const template = new Template({
    tag: "table",
    children: [
        { tag: "caption", children: [{ tag: "span", ref: "captionTitle" }] },
        {
            tag: "tfoot",
            children: [
                { tag: "button", ref: "createButton", props: { textContent: "Create" } },
                { tag: "button", ref: "okButton", props: { textContent: "Ok" } },
            ],
        },
        {
            tag: "tbody",
            ref: "body",
            children: [
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "docId" } },
                        // tslint:disable-next-line:insecure-random
                        { tag: "td", children: [{ tag: "input", ref: "idBox", props: { value: `Untitled-${Math.random().toString(36).substr(2, 6)}` } }] },
                    ],
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "Server" } },
                        { tag: "td", children: [{ tag: "input", ref: "serverBox", props: { value: "https://alfred.wu2-ppe.prague.office-int.com" } }] },
                    ],
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "userId" } },
                        { tag: "td", children: [{ tag: "input", ref: "userBox", props: { value: "anonymous-coward" } }] },
                    ],
                },
                /*
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "Rows" }},
                        { tag: "td", props: { textContent: "Npm" }, children: [{ tag: "input", ref: "rowsBox", props: { type: "number", min: "1", value: "5" }}]},
                    ]
                },
                {
                    tag: "tr",
                    children: [
                        { tag: "td", props: { textContent: "Columns" }},
                        { tag: "td", props: { textContent: "Npm" }, children: [{ tag: "input", ref: "colsBox", props: { type: "number", min: "1", value: "5" }}]},
                    ]
                }
                */
            ],
        },
    ],
});

export class ConfigView {
    public readonly root = template.clone();

    public readonly done: Promise<void>;
    private readonly caption    = template.get(this.root, "captionTitle") as HTMLElement;
    private readonly idBox      = template.get(this.root, "idBox") as HTMLInputElement;
    private readonly serverBox  = template.get(this.root, "serverBox") as HTMLInputElement;
    private readonly userBox    = template.get(this.root, "userBox") as HTMLInputElement;
    // private readonly colsBox    = template.get(this.root, "colsBox") as HTMLInputElement;
    // private readonly rowsBox    = template.get(this.root, "rowsBox") as HTMLInputElement;
    private readonly okButton   = template.get(this.root, "okButton") as HTMLButtonElement;
    private readonly createButton   = template.get(this.root, "createButton") as HTMLButtonElement;

    constructor(private readonly runtime: IComponentRuntime, private readonly map: ISharedMap) {
        this.caption.innerText = `Table View ${this.runtime.id}`;

        this.done = new Promise<void>((accept) => {
            this.createButton.addEventListener("click", () => {
                this.runtime.createAndAttachProcess(this.idBox.value, "@chaincode/table-document");
                this.map.set(ConfigKeys.docId, this.idBox.value);
                accept();
            });

            this.okButton.addEventListener("click", () => {
                this.map.set(ConfigKeys.serverUrl, this.serverBox.value);
                this.map.set(ConfigKeys.userId, this.userBox.value);
                this.map.set(ConfigKeys.docId, this.idBox.value);
                // this.map.set(ConfigKeys.numRows, this.rowsBox.value);
                // this.map.set(ConfigKeys.numCols, this.colsBox.value);
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
