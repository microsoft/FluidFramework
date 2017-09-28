import * as ui from "../ui";

/**
 * Basic dock panel control
 */
export class Dock extends ui.Component {
    public bottom: ui.Component;
    public content: ui.Component;

    constructor(element: HTMLDivElement) {
        super(element);
    }

    public addContent(content: ui.Component) {
        this.content = content;
        this.updateChildren();
    }

    public addBottom(bottom: ui.Component) {
        this.bottom = bottom;
        this.updateChildren();
    }

    protected resizeCore(bounds: ui.Rectangle) {
        let bottomOffset = 0;
        if (this.bottom) {
            const result = this.bottom.measure(bounds.size);
            bottomOffset = result.height;
        }

        let split = bounds.nipVertBottom(bottomOffset);

        this.updateChildBoundsIfExists(this.content, split[0]);
        this.updateChildBoundsIfExists(this.bottom, split[1]);
    }

    /**
     * Updates the list of children and then forces a resize
     */
    private updateChildren() {
        this.removeAllChildren();
        ui.removeAllChildren(this.element);
        this.addChildIfExists(this.content);
        this.addChildIfExists(this.bottom);
        this.resizeCore(this.size);
    }

    private addChildIfExists(child: ui.Component) {
        if (child) {
            this.addChild(child);
            this.element.appendChild(child.element);
        }
    }

    private updateChildBoundsIfExists(child: ui.Component, bounds: ui.Rectangle) {
        if (child) {
            bounds.conformElement(child.element);
            child.resize(bounds);
        }
    }
}
