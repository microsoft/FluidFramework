import * as ui from "../ui";

export class Layer {
    protected canvas = document.createElement("canvas");

    // Do I want a pluggable render function here?
}

/**
 * Used to render ink
 */
export class InkLayer extends Layer {
    // store instructions used to render itself? i.e. the total path? Or defer to someone else to actually
    // do the re-render with a context?
}

/**
 * API access to a drawing context that can be used to render elements
 */
export class OverlayCanvas extends ui.Component {
    private throttler = new ui.AnimationFrameThrottler(() => this.render());
    private canvas: HTMLCanvasElement;
    private layers: Layer[] = [];

    constructor(private container: HTMLDivElement) {
        super(container);
        this.canvas = document.createElement("canvas");
        this.container.appendChild(this.canvas);
    }

    public addLayer(layer: Layer) {
        this.layers.push(layer);
        this.markDirty();
    }

    /**
     * Marks the canvas dirty and triggers a render
     */
    private markDirty() {
        this.throttler.trigger();
    }

    private render() {
        // TODO
        // composite the layers together off of the animation clock
        // based on the type of layer optimize how exactly we render the overall canvas - i.e. do I split
        // things into multiple canvas divs or just use a single one
    }
}
