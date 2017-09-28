import * as ui from "../ui";

/**
 * Stack panel
 */
export class StackPanel extends ui.Component {
    public bottom: ui.Component;
    public content: ui.Component;

    constructor(element: HTMLDivElement, classList: string[]) {
        super(element);
        element.classList.add(...classList);
    }

    /**
     * Adds a new child to the stack
     */
    public addChild(component: ui.Component) {
        super.addChild(component);
        this.element.appendChild(component.element);
    }

    /**
     * Returns a size whose height is capped to the max child height
     */
    public measure(size: ui.ISize): ui.ISize {
        let height = 0;
        const children = this.getChildren();
        for (const child of children) {
            const measurement = child.measure(size);
            height = Math.min(Math.max(height, measurement.height), size.height);
        }

        return { height, width: size.width };
    }

    protected resizeCore(bounds: ui.Rectangle) {
        bounds = new ui.Rectangle(0, 0, bounds.width, bounds.height);
        // layout is very primitive right now... the below is tailored for a list of buttons
        const children = this.getChildren();
        let remainingBounds = bounds;
        for (const child of children) {
            const measurement = child.measure(remainingBounds.size);
            const updatedBounds = remainingBounds.nipHoriz(measurement.width);
            updatedBounds[0].conformElement(child.element);
            child.resize(updatedBounds[0]);
            remainingBounds = updatedBounds[1];
        }
    }
}
