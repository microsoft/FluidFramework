import { Template, Dom } from "@prague/flow-util";
import * as styles from "./index.css";
import { IFlowViewComponentState, FlowViewComponent } from "..";

const template = new Template({ 
    tag: "span",
    props: { className: styles.inclusion },
});

export interface IInclusionProps { child: Node }
export interface IInclusionViewState extends IFlowViewComponentState { } 

export class InclusionView extends FlowViewComponent<IInclusionProps, IInclusionViewState> {
    public static readonly factory = () => new InclusionView();

    public mounting(props: Readonly<IInclusionProps>): IInclusionViewState {
        const root = template.clone();
        return this.updating( props, { root, cursorTarget: props.child });
    }

    public updating(props: Readonly<IInclusionProps>, state: Readonly<IInclusionViewState>): IInclusionViewState {
        const root = state.root;
        const desiredChild = props.child;

        if (root.firstChild !== desiredChild) {
            Dom.replaceFirstChild(root, desiredChild);
            state = { root, cursorTarget: desiredChild };
        }
        
        return state;
    }

    public unmounting(state: Readonly<IInclusionViewState>) { }
}