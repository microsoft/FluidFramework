# Component Model Requirements
Successful JavaScript frameworks generally play well with others.  Our components should be designed to be easily and efficientently wrapped by popular frameworks like React, Angular, and Vue.

In order to be agnostic to the application's choice of UI framework, Prague components should adhering to the following guidelines:

* Does not side-effect other DOM elements, except through explicit relationships and normal DOM/CSS mechanics (e.g., move focus, reflow layout, etc.)
* Construct DOM in a semantically meaningful way
* Use DOM focus, eventing, and selection
* Styled / sized / positioned via CSS

Below I've expanded a bit on each of these, but in general, Prague components should mimic the behavior of instrinsic DOM elements as this what UI frameworks are used to working with.

## Side-Effects
Components generally only side-effect each other indirectly via normal DOM and CSS mechanics (moving focus, reflowing layout, etc.), or via relationships established by the application (e.g., updating one component's in response to events raised by another).  This includes special parent/child relationships, such as the app parenting a component with a scrolling viewport component that virtualizes/windows it's children to avoid rendering offscreen content.

Prague components with an established relationship may detect and use well known interfaces to improve their cooperation.  (More on this below).

Components should avoid editing DOM elements they did not create, intereferring with DOM focus and eventing, and introducing global CSS styles.  Components that host/contain foreign children need to take particular care not to uninentially side-effect their children (e.g., reparenting or moving a child element can cause focus loss or halt media playback.)

## Construct DOM in a semantically meaningful way
Components should construct the DOM in a semantically meaningful way to ensure that DOM selection ranges behave naturally, accessibility clients can navigate the document, etc.  For example, make appropriate use of semantic tags like ```<p>```, use DOM focus in a semantically meaningful way, and use labels, ShadowRoot or css-content to disambiguate confusing/non-semantic content.

## DOM Focus and Eventing
General guidelines for participating in DOM events in a composable way:
* Typically, events are handled during the bubble phase.  The capture phase is reserved for intecepting/filtering events that should not reach children.
* A component indicates it has consumed an event by stopping it's propagation and canceling it's default behavior.

Note: container/host components must be aware that some UI frameworks subscribe to components at the document/window level, and therefore cannot assume that because an event is bubbling up from a foreign component that the the foreign component is uninterested.

## Selection
Components must support the use of DOM selection for selections that span Prague components and foreign elements.  When a selection is confined within a tree of Prague components, it is permissible to implement a custom notion of selection to support scenarios that can not be expressed through the DOM today (e.g., selecting a column of a table, which is discontiguous in and possible ineffecient in the DOM).

## Passive CSS Styling / Sizing / Positioning
Prague components should construct their DOM to be convenient targets for CSS styling.  When possible, components should construct their DOM to avoid needing to know specific sizes/positions of elements as application author can and should taylor these via CSS to match their application's theme.  When unavoidable, components should query positions in batches at the end reflow to avoid multiple/unnecessary layout calculations.

# IComponent Interface
A Prague component exposes an APIs for reading and w

The primary operations supported by a Prague component are mounting/unmounting.  Mounting provisions the component instance with Prague storage, plus whatever additional capabilities and properties are required to configure the component to interpret and access Prague data.  Unmounting disconnects the component.

Components also expose a 'sync()' 

```typescript
/** Factory for . */
interface IComponentType<TProps, TComponent> {
    public async open(props: TProps): TComponent
}

abstract class ComponentType<TProps, TState, TComponent> implements IComponentType<TProps> {
    /** Subclass implements 'create()' to put initial document structure in place. */
    protected abstract create(props: TProps): TState;

    /**
     * Subclass implements 'opened()' to finish initialization after the component has been
     * opened/created, but before the component instance has been returned to the caller.
     */
    protected abstract async opened(props: TProps, state: TState): TComponent;
}

interface IComponent {
    close();
}

interface IView<TProps> {
    mount(props: TProps): Element;
    update(props: TProps);
    unmount();
}

abstract class ViewComponent<TProps> implements IComponent<TProps> {
    /** Returns 'this' as IView.  We do this to make it easy to feature-detect the IView support on components. */
    public get view(): IView;
}

// Usage:
const pinPointComponent = await PinPointMapType.open({ storage, id: "fast pajamas" });

div1.appendChild(
    pinPointComponent.view.mount({ className: "red-map" }));

div2.appendChild(
    pinPointComponent.view.mount({ className: "blue-map" }));

```


```typescript
interface PinpointMapIn {
    bounds: ClientRect;
    style: CSSStyleDeclaration;
}

/** Minimal interface for Prague components. */
interface IComponent<TProps, TState> {
    public async mount(store: Store, props: TProps): TState;
    public async unmount(state: TState);
}

interface IViewState {
    view: Element;
}

interface IHTMLViewState {
    view: HTMLElement;
}

interface IView<TProps, TState extends IViewState> {
    public connect(props: TProps): TState;
    public disconnect(state: TState);
    public invalidate();
}

/** Base class implementation. */
class Component<TProps, TState> implements IComponent<TProps, TState> {
    protected abstract async mounting(store: Store, props: TProps): TState;
    protected abstract async mounted(props: TProps, state: TState): TState;    
    protected abstract async unmounting(state: TState);
}

class View {
    protected abstract connecting(props: TProps): TState;
    protected abstract connected?(props: TProps, state: TState): TState;
    protected abstract update(props: TProps, state: TState): TState;
    protected abstract disconnected(state: TState);
}
```

# Principles
* Web components are self-contained islands of HTML/CSS/JS.
* Web components only interact w/each other indirectly:
    * via CSS layout / DOM focus & event propagation
    * via the app
* Prague components are hierachical/extensible web components
    * Prague components/containers may communicate directly

# Cross-Component App Services
* Scheduling (microtask, frame, idle, messageport)
* Binding / Dependency-Tracking / Recalculation

# Container Services
* Virtualization/Windowing
    * Lifecycle
        * mount/unmount
        * visibility
    * Scrolling
        * scrollIntoView(position)
        * Scroll-chaining / cartoon physics
* Navigation
    * Tab Stops (DOM)
    * Enter/Escape nested components
    * Directional:
        * Left/Right -> Tab Forward / Backward (?)
        * Up/Down -> Geometric / overridable
* Adornment Stack (via CSS class names preferred)
    * Highlight
    * Tooltip / Annotation / Balloon Menus
    * Design-time
* Selection / Clipboard
    * Promote to DOM selection as needed
* Collapsing / Semantic Zoom (?)

# Document Services
* Search / Table-of-contents

# UX Services
* Commanding (Merged toolbar, context menu, etc.)
    * Components provide APIs for binding to app's UI FX of choice.
    * Common dialogs and popups

# Reusable Code
* IME

# W3C
* Selection / Clipboard
* Events
* Render / Layout / Styling

Generally, directional navigation is not a thing on the web.  Arrow keys scroll or move a caret inside a text area.  The only FX I know of that tackles directional navigation is WinJS, and this is for Gamepads on Xbox.