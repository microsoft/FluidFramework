import { Node } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { ILoader } from "@microsoft/fluid-container-definitions";
import { IComponent, IComponentHTMLRender, IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";

export class ComponentView implements NodeView {
    public dom: HTMLElement;
    public innerView;
    
    private renderable: IComponentHTMLView | IComponentHTMLRender;

    constructor(
        public node: Node,
        public outerView: EditorView,
        public getPos: () => number,
        public loader: ILoader,
    ) {
        // The node's representation in the editor (empty, for now)
        this.dom = document.createElement("fluid");
        const src = node.attrs["src"];
        this.load(src);
    }

    selectNode() {
        this.dom.classList.add("ProseMirror-selectednode");
    }

    deselectNode() {
        this.dom.classList.remove("ProseMirror-selectednode");
    }

    dispatchInner(tr) {
    }

    update(node) {
        return true;
    }

    destroy() {
    }

    private load(url: string) {
        this.attach(url);
        const containerP = this.loader.resolve({ url });
        containerP.then((container) => {
            container.on("contextChanged", (value) => {
                this.attach(url);
            });
        })
    }

    private attach(url: string) {
        const loadP = this.loader.request({ url });
        const componentP = loadP.then(
            (result) => {
                if (result.mimeType !== "fluid/component") {
                    return Promise.reject<IComponent>();
                }

                const component = result.value as IComponent;
                if (!component.IComponentHTMLVisual) {
                    return Promise.reject<IComponent>();
                }

                return component;
            });

        componentP.then(
            (component) => {
                // clear any previous content
                this.dom.innerHTML = "";

                // Remove the previous view
                if (this.renderable && "remove" in this.renderable) {
                    this.renderable.remove();
                }

                const visual = component.IComponentHTMLVisual;
                this.renderable = visual.addView ? visual.addView() : visual;
                this.renderable.render(this.dom);
            },
            (error) => {
                // fall back to URL if can't load
                this.dom.innerHTML = `<a href="${url}">${url}</a>`;
            });
    }
}
