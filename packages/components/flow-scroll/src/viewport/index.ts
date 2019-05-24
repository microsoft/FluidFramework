import { FlowDocument } from "@chaincode/flow-document";
import { Editor } from "@chaincode/flow-editor";
import { Scheduler, Template, View } from "@prague/flow-util";
import { Page } from "../page";
import * as styles from "./index.css";

const template = new Template({
    tag: "div",
    props: { className: styles.viewport },
    children: [
        { tag: "div", props: { className: styles.document, tabIndex: 0 }, children: [
            { tag: "div", ref: "slot", props: { className: styles.slot }},
        ]},
    ],
});

interface IViewportInit {
    doc: FlowDocument;
    scheduler: Scheduler;
}

export class Viewport extends View<IViewportInit> {
    private state?: {
        doc: FlowDocument;
        scheduler: Scheduler;
        slot: HTMLElement;
        editor: Editor;
        elementToPage: WeakMap<Element, Page>;
    };

    public get editor() {
        return this.state.editor;
    }

    protected onAttach(init: Readonly<IViewportInit>) {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;
        const { doc, scheduler } = init;

        const pageRoot = document.createElement("div");
        slot.appendChild(pageRoot);

        const page = new Page();
        page.attach(pageRoot, {
            doc,
            scheduler,
            pageStart: undefined,
            onPaginationStop: undefined,
        });

        this.state = { doc, editor: page.editor, scheduler, slot, elementToPage: new WeakMap() };

        return root;
    }

    protected onUpdate(): void {
        // do nothing
    }

    protected onDetach(): void {
        // do nothing
    }
}
