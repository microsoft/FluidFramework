import * as ui from "../ui";

/**
 * Orientation of the stack panel
 */
export enum Orientation {
    Horizontal,
    Vertical,
}

/**
 * Stack panel
 */
export class StackPanel extends ui.Component {
    public bottom: ui.Component;
    public content: ui.Component;

    constructor(element: HTMLDivElement, private orientation: Orientation, classList: string[]) {
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
        let fixed = 0;
        let variable = 0;

        const children = this.getChildren();
        for (const child of children) {
            const measurement = child.measure(size);

            // Update the fixed and variable components depending on the orientation of the stack panel.
            // The algorithm selects the max value from the fixed orientation and then adds together the variable sizes
            fixed = Math.max(
                fixed,
                this.orientation === Orientation.Horizontal ? measurement.height : measurement.width);
            variable += this.orientation === Orientation.Horizontal ? measurement.width : measurement.height;
        }

        // Cap against the specified size
        return {
            height: Math.min(size.height, this.orientation === Orientation.Horizontal ? fixed : variable),
            width: Math.min(size.width, this.orientation === Orientation.Horizontal ? variable : fixed),
        };
    }

    protected resizeCore(bounds: ui.Rectangle) {
        bounds = new ui.Rectangle(0, 0, bounds.width, bounds.height);
        // layout is very primitive right now... the below is tailored for a list of buttons
        const children = this.getChildren();
        let remainingBounds = bounds;
        for (const child of children) {
            const measurement = child.measure(remainingBounds.size);
            const updatedBounds = this.orientation === Orientation.Horizontal
                ? remainingBounds.nipHoriz(measurement.width)
                : remainingBounds.nipVert(measurement.height);
            updatedBounds[0].conformElement(child.element);
            child.resize(updatedBounds[0]);
            remainingBounds = updatedBounds[1];
        }
    }
}
