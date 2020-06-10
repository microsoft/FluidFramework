# How to write a visual component

## IComponentHtmlView

All Fluid components expose their capabilities using the `IComponentX` interface pattern. Please see [Feature detection and delegation](https://fluid-docs.azurewebsites.net/versions/new/docs/components.html#feature-detection-and-delegation) for more information on this.

As such, any component that provides a view exposes this capablity by implementing the `IComponentHTMLView` interface provided by the Fluid Framework. Let's take a look at what this interface needs:

```typescript
/**
 * An IComponentHTMLView is a renderable component
 */
export interface IComponentHTMLView extends IProvideComponentHTMLView {
    /**
     * Render the component into an HTML element.
     */
    render(elm: HTMLElement, options?: IComponentHTMLOptions): void;

    /**
     * Views which need to perform cleanup (e.g. remove event listeners, timers, etc.) when
     * removed from the DOM should implement remove() and perform that cleanup within.
     */
    remove?(): void;
}

export interface IProvideComponentHTMLView {
    readonly IComponentHTMLView: IComponentHTMLView;
}
```

As we can see, the only mandatory functions necessary are the `IComponentHTMLView` identifier and a `render(elm: HTMLElement)` function. `remove()` is not mandatory and only necessary for clean up operations when the view is being removed.

- `IComponentHTMLView` can simply provide itself as `this` to identify that this component itself is indeed a view provider. As such, another component (componentB) that does not know if this component (componentA) provides a view or not can check by seeing if `componentA.IComponentHTMLView` is defined or not. At this point, it can render it by calling `componentA.IComponentHTMLView.render()`. This may seem initially confusing but the example below should demonstrate its ease of implementation.

- `render` is a function that takes in the parent HTML document element and allows children to inject append their views to it. The `elm` parameter passed in here can be modified and returned. If you are using React as your view framework, this is where you would pass the elm to the ReactDOM to start rendering React components

```typescript
public render(elm: HTMLElement) {
        ReactDOM.render(
            <View props={...} />,
            elm,
        );
    }
 ```


We will take another look at our initial Dice Roller example to see how a component can implement this interface
