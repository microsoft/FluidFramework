import { FlowDocument } from "@chaincode/flow-document";
import { Editor, PagePosition } from "@chaincode/flow-editor";
import { ResizeObserver, Scheduler, Template, View } from "@prague/flow-util";
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
        pageStart: PagePosition;
        resizeObserver: ResizeObserver;
        repaginate: () => void;
    };

    protected onAttach(props: Readonly<IPageInit>) {
        const root = template.clone() as HTMLElement;
        const slot = template.get(root, "slot") as HTMLElement;

        const editor = new Editor();
        const { doc, scheduler, pageStart, onPaginationStop } = props;
        editor.mount({
            doc,
            scheduler,
            eventSink: root,
            trackedPositions: [],
            start: pageStart,
            paginationBudget: -1,
            onPaginationStop,
        });

        const resizeObserver = new ResizeObserver();
        resizeObserver.attach(slot, {
            subject: editor.root,
            callback: this.onResize,
        });

        const repaginate = scheduler.coalesce(scheduler.onLayout, () => {
            this.state.editor.paginate(
                this.state.pageStart,
                this.root.getBoundingClientRect().height);
        });

        this.state = {
            slot,
            editor,
            pageStart,
            resizeObserver,
            repaginate,
        };

        return root;
    }

    protected onUpdate(props: IPageProps) {
        Object.assign(this.state, props);
        this.state.repaginate();
    }

    protected onDetach() {
        this.state.resizeObserver.detach();
        this.state.editor.unmount();
    }

    private readonly onResize = () => {
        this.state.repaginate();
    }
}
