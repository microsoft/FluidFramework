import { Template } from "@prague/flow-util";
import { FlowViewComponent } from "..";
import * as styles from "./index.css";
const template = new Template({
    tag: "span",
    props: { innerHTML: "&nbsp", className: styles.lineBreak },
    children: [
        { tag: "span", ref: "cursorTarget", props: { className: styles.afterLineBreak } },
        { tag: "br" },
    ],
});
export class LineBreakView extends FlowViewComponent {
    mounting(props) {
        const root = template.clone();
        const cursorTarget = template.get(root, "cursorTarget");
        return { root, cursorTarget };
    }
    updating(props, state) {
        return state;
    }
    unmounting(state) { }
}
LineBreakView.factory = () => new LineBreakView();
//# sourceMappingURL=index.js.map