import { FlowDocument } from "@chaincode/flow-document";
import { IViewState, Scheduler, Template, View } from "@prague/flow-util";
import { PagePosition } from "../../../flow-editor/dist";
import { debug } from "../debug";
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

interface IPageInfo {
    page: Page;
    root: HTMLElement;
}

interface IViewportProps {
    doc: FlowDocument;
    scheduler: Scheduler;
}

interface IViewportState extends IViewState {
    doc: FlowDocument;
    scheduler: Scheduler;
    slot: HTMLElement;
    // tslint:disable-next-line:prefer-array-literal
    pages: IPageInfo[];
}

export class Viewport extends View<IViewportProps, IViewportState> {
    protected onAttach(props: Readonly<IViewportProps>): IViewportState {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;
        const { doc, scheduler } = props;

        const state = { doc, pages: [], root, scheduler, slot };
        this.addPage(state, [doc.addLocalRef(0)]);

        return state;
    }

    protected onUpdate(props: Readonly<IViewportProps>, state: IViewportState): void {
        // do nothing
    }

    protected onDetach(state: IViewportState): void {
        // do nothing
    }

    private addPage(state: IViewportState, pageStart: PagePosition) {
        const { doc, pages, scheduler } = state;
        debug(`Inserted page #${pages.length}`);

        const pageRoot = document.createElement("div");
        state.slot.appendChild(pageRoot);

        const page = new Page();
        const nextIndex = pages.push({ page, root: pageRoot });

        page.attach(pageRoot, {
            doc,
            scheduler,
            pageStart,
            onPaginationStop: (position) => {
                this.noteNewStop(nextIndex, position);
            },
        });
    }

    private noteNewStop(pageIndex: number, newStart: PagePosition) {
        const { doc, pages } = this.state;

        const pos = doc.localRefToPosition(newStart[0]);

        this.state.scheduler.onIdle(() => {
            // If the new page stop is the end of the document, remove any following pages.
            if (pos === doc.length) {
                while (pages.length > pageIndex) {
                    const toDelete = pages.pop();
                    toDelete.root.remove();
                    toDelete.page.detach();
                    debug(`Removed page #${pages.length}`);
                }

                return;
            }

            const page = this.state.pages[pageIndex];
            if (page === undefined) {
                this.addPage(this.state, newStart);
            } else {
                page.page.update({ pageStart: newStart });
                debug(`Updated page #${pages.length}`);
            }
        });
    }
}
