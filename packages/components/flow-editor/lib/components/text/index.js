import { Template } from "@prague/flow-util";
import { FlowViewComponent } from "..";
import * as styles from "./index.css";
const template = new Template({ tag: "p", props: { className: styles.text } });
export class TextView extends FlowViewComponent {
    mounting(props) {
        const root = template.clone();
        return this.updating(props, { root, cursorTarget: root });
    }
    updating(props, state) {
        console.assert(props.text !== "", "Should not emit a TextView for empty text.");
        const root = state.root;
        if (root.textContent === props.text) {
            return state;
        }
        root.textContent = props.text;
        // Note: As long as textContent is not empty, the <span> must have a firstChild.
        return { root, cursorTarget: root.firstChild };
    }
    unmounting(state) { }
}
TextView.factory = () => new TextView();
//# sourceMappingURL=index.js.map