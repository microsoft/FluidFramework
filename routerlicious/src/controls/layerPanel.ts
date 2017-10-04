import * as ui from "../ui";

/**
 * A layer panel stacks children in a z order defined by their child index. It is used to overlay layers
 * on top of each other.
 */
export class LayerPanel extends ui.Component {
    public bottom: ui.Component;
    public content: ui.Component;

    constructor(element: HTMLDivElement) {
        super(element);
    }

    /**
     * Adds a new child to the stack
     */
    public addChild(component: ui.Component) {
        super.addChild(component);
        this.element.appendChild(component.element);
    }

    protected resizeCore(bounds: ui.Rectangle) {
        const children = this.getChildren();
        for (const child of children) {
            bounds.conformElement(child.element);
            child.resize(bounds);
        }
    }
}
