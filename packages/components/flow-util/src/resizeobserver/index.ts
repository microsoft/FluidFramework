// tslint:disable:no-relative-imports
// tslint:disable:import-name
// tslint:disable:variable-name
import { isBrowser } from "../isbrowser";
import { Template } from "../template";
import { IViewState, View } from "../view";
import * as style from "./index.css";

// tslint:disable:object-literal-sort-keys
const template = isBrowser && new Template(
    { tag: "div", ref: "root", props: { className: style.root }, children: [
        { tag: "div", ref: "observer", props: { className: style.observer }, children: [
            { tag: "div", ref: "expand", props: { className: style.expand }, children: [
                { tag: "div", ref: "expandChild", props: { className: style.expandChild } },
            ]},
            { tag: "div", ref: "shrink", props: { className: style.shrink }, children: [
                { tag: "div", props: { className: style.shrinkChild }},
            ]},
        ]},
        { tag: "span", ref: "slot" },
    ]},
);

interface IResizeObserverProps {
    subject: Element;
    callback: () => void;
}

interface IResizeObserverState extends IViewState {
    callback: () => void;
    root: HTMLElement;
    expand: HTMLElement;
    expandChild: HTMLElement;
    shrink: Element;
    slot: Element;
    width: number;     // TS2564: Assigned in ctor via call to 'this.reset()'.
    height: number;    // TS2564: Assigned in ctor via call to 'this.reset()'.
}

export class ResizeObserver extends View<IResizeObserverProps, IResizeObserverState, {}> {
    protected onAttach(props: Readonly<IResizeObserverProps>): IResizeObserverState {
        const root = template.clone() as HTMLElement;
        const expand = template.get(root, "expand") as HTMLElement;
        const expandChild = template.get(root, "expandChild") as HTMLElement;
        const shrink = template.get(root, "shrink");
        const slot = template.get(root, "slot");

        expand.addEventListener("scroll", this.onExpandScrolled);
        shrink.addEventListener("scroll", this.onShrinkScrolled);
        slot.appendChild(props.subject);

        return { callback: props.callback, root, expand, expandChild, shrink, slot, width: NaN, height: NaN };
    }

    protected onUpdate(props: Readonly<{}>, state: IResizeObserverState): void {
        this.reset();
    }

    protected onDetach(state: IResizeObserverState): void {
        state.expand.removeEventListener("scroll", this.onExpandScrolled);
        state.shrink.removeEventListener("scroll", this.onShrinkScrolled);
    }

    private readonly onExpandScrolled = () => {
        const { root, width, height } = this.state;
        if (root.offsetWidth > width || root.offsetHeight > height) {
            this.state.callback();
        }
        this.reset();
    }

    private readonly onShrinkScrolled = () => {
        const { root, width, height } = this.state;
        if (root.offsetWidth < width || root.offsetHeight < height) {
            this.state.callback();
        }
        this.reset();
    }

    private reset() {
        const { expandChild, expand, shrink, root } = this.state;
        expandChild.style.width = `${expand.offsetWidth + 1}px`;
        expandChild.style.height = `${expand.offsetHeight + 1}px`;
        expand.scrollLeft = expand.scrollWidth;
        expand.scrollTop = expand.scrollHeight;
        shrink.scrollLeft = shrink.scrollWidth;
        shrink.scrollTop = shrink.scrollHeight;
        this.updateState({ width: root.offsetWidth, height: root.offsetHeight });
    }
}
