import { Template } from "@prague/flow-util";
import { IViewState, View } from "..";
import * as styles from "./index.css";
import { Dom } from "@prague/flow-util";

const template = new Template({
    tag: "div",
    props: { className: styles.viewport },
    children: [
        { tag: "div", props: { className: styles.ref }, children: [
            { tag: "div", ref: "transform", props: { className: styles.transform }, children: [
                { tag: "div", props: { className: styles.document }, children: [
                    { tag: "div", ref: "slot", props: { className: styles.slot }},
                ]},
            ]},
            { tag: "div", props: { className: `${styles.slot} ${styles.position}` }, children: [
                { tag: "div", props: { className: `${styles.document} ${styles.position}` }, children: [
                    { tag: "div", ref: "origin", props: { className: styles.origin }},
                ]},
            ]},
        ]},
        {
            tag: "div",
            ref: "scrollPane",
            props: { className: styles.scrollPane },
            children: [
                { tag: "div", ref: "space", props: { className: styles.space }}
            ]
        }
    ]
});

export interface IViewportProps { 
    slot: Element,
    sizeY: number,
    offsetY: number;
    onScroll: (position: number) => void;
}

export interface IViewportViewState extends IViewState {
    props: IViewportProps;
    root: Element;
    transform: HTMLElement,
    slot: HTMLElement;
    origin: HTMLElement;
    space: HTMLElement;
    scrollPane: HTMLElement;
    sizeY: number;
    offsetY: number;
}

export class ViewportView extends View<IViewportProps, IViewportViewState> {
    public static readonly factory = () => new ViewportView();

    private readonly onScroll = (e: MouseEvent) => {
        const state = this.state;
        state.props.onScroll(state.scrollPane.scrollTop);
    };

    public get slotOriginTop() { 
        return this.state.origin.getBoundingClientRect().top;
    }

    public mounting(props: Readonly<IViewportProps>): IViewportViewState {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;
        const transform = template.get(root, "transform") as HTMLElement;
        const origin = template.get(root, "origin") as HTMLElement;
        const scrollPane = template.get(root, "scrollPane") as HTMLElement;
        const space = template.get(root, "space") as HTMLElement;

        scrollPane.addEventListener("scroll", this.onScroll);
          
        root.addEventListener("wheel", (e: WheelEvent) => {
            const delta = e.deltaY;
            scrollPane.scrollTop += delta;
        });

        return this.updating(props, {
            props,
            root,
            slot,
            transform,
            origin,
            scrollPane,
            space,
            offsetY: 0,
            sizeY: props.sizeY
        });
    }

    public updating(props: Readonly<IViewportProps>, state: Readonly<IViewportViewState>): IViewportViewState {
        Dom.ensureFirstChild(state.slot, props.slot);
        state.space.style.height = `${props.sizeY}px`;
        console.log(`  offset: ${props.offsetY}`)
        state.transform.style.top = `${props.offsetY}px`;
        return state;
    }

    public unmounting(state: Readonly<IViewportViewState>) { 
        state.root.removeEventListener("scroll", this.onScroll);
    }
}