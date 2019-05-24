import { FlowDocument } from "@chaincode/flow-document";
import { Editor, PagePosition } from "@chaincode/flow-editor";
import { Scheduler, Template, View } from "@prague/flow-util";
import * as styles from "./index.css";

const template = new Template({
    tag: "div",
    props: { className: styles.page, tabIndex: 0 },
    children: [
        { tag: "div", ref: "slot", props: { className: styles.slot }},
    ],
});

interface IPageProps {
    pageStart: PagePosition;
}

interface IPageInit extends IPageProps {
    doc: FlowDocument;
    scheduler: Scheduler;
    onPaginationStop: (position: PagePosition) => void;
}

export class Page extends View<IPageInit, IPageProps> {
    private state?: {
        slot: HTMLElement;
        editor: Editor;
    };

    public get editor() { return this.state.editor; }

    protected onAttach(props: Readonly<IPageInit>) {
        const root = template.clone() as HTMLElement;
        const slot = template.get(root, "slot") as HTMLElement;

        const editor = new Editor();
        const { doc, scheduler } = props;

        slot.appendChild(
            editor.mount({
                doc,
                scheduler,
                eventSink: root,
                trackedPositions: [],
            }),
        );

        this.state = {
            slot,
            editor,
        };

        return root;
    }

    protected onUpdate(props: IPageProps) {
        Object.assign(this.state, props);
    }

    protected onDetach() {
        this.state.editor.unmount();
    }
}
