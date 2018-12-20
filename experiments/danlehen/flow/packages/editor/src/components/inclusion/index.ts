import { Template, Dom } from "@prague/flow-util";
import * as styles from "./index.css";
import { IViewState, View } from "..";

const template = new Template({ 
    tag: "p",
    props: { className: styles.inclusion },
});

export interface IInclusionProps { root: Node }
export interface IInclusionViewState extends IViewState {
    cursorTarget?: Node;
}

export class InclusionView extends View<IInclusionProps, IInclusionViewState> {
    public static readonly factory = () => new InclusionView();

    mounting(props: Readonly<IInclusionProps>): IInclusionViewState {
        const root = template.clone();
        return this.updating( props, { root });
    }

    updating(props: Readonly<IInclusionProps>, state: Readonly<IInclusionViewState>): IInclusionViewState {
        const root = state.root;
        const desiredChild = props.root;

        if (root.firstChild !== desiredChild) {
            Dom.replaceFirstChild(root, desiredChild);
            state = { root, cursorTarget: desiredChild };
        }
        
        return state;
    }

    unmounting(state: Readonly<IInclusionViewState>) { }
}