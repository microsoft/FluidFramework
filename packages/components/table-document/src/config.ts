import { ComponentRuntime } from "@prague/component-runtime";
import { Template } from "@prague/flow-util";
import { ISharedMap } from "@prague/map";
import { ConfigKeys } from "./configKeys";

export const cellRangeExpr = /([a-zA-Z]+)(\d+):([a-zA-Z]+)(\d+)/;

const template = new Template({
    tag: "form",
    children: [
        {
            tag: "table",
            props: { action: "demo" },
            children: [
                { tag: "caption", children: [{ tag: "span", ref: "captionTitle", props: { textContent: "Table-Slice Configuration" } }]},
                {
                    tag: "tfoot",
                    children: [
                        { tag: "button", ref: "okButton", props: { textContent: "Ok" } },
                    ],
                },
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
                        { tag: "td", props: { textContent: "values" }},
                        { tag: "td", children: [{
                            tag: "input",
                            ref: "valuesBox",
                            props: {
                                type: "text",
                                value: "A1:A4",
                                pattern: `${cellRangeExpr.source}`,
                                title: "Cell range must be in the form 'RC:RC' (e.g., 'A1:F6')" },
                        }]},
                    ],
                },
            ],
        },
    ],
});

export class ConfigView {
    public readonly root = template.clone();

    public readonly done: Promise<void>;
    private readonly caption        = template.get(this.root, "captionTitle") as HTMLElement;
    private readonly idBox          = template.get(this.root, "idBox") as HTMLInputElement;
    private readonly valuesBox      = template.get(this.root, "valuesBox") as HTMLInputElement;
    private readonly okButton       = template.get(this.root, "okButton") as HTMLButtonElement;

    constructor(private readonly host: ComponentRuntime, private readonly map: ISharedMap) {
        this.caption.innerText = `Table-Slice: '${this.host.id}'`;

        this.done = new Promise<void>((accept) => {
            this.okButton.addEventListener("click", () => {
                this.map.set(ConfigKeys.docId, this.idBox.value);
                this.map.set(ConfigKeys.valuesText, this.valuesBox.value);
                accept();
            });
        });
    }
}
