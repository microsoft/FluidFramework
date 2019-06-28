import { Template } from "@prague/flow-util";
import { FlowViewComponent } from "..";
import * as styles from "./index.css";
const template = new Template({
    tag: "span",
    props: { className: styles.paragraph },
    children: [
        { tag: "span", ref: "cursorTarget", props: { className: styles.afterParagraph, textContent: "\u200b" } },
        { tag: "p" },
    ],
});
export class ParagraphView extends FlowViewComponent {
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
ParagraphView.factory = () => new ParagraphView();
//# sourceMappingURL=index.js.map