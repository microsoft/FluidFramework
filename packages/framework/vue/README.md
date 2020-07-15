# @fluidframework/vue

The Fluid Frameworks Vue package provides the base hooks and component class for building Vue components that uses a synced state provided by Fluid. Its goal is to make it very easy for a Vue developer to build large, scalable Vue apps with synced Fluid components.

To see an example, please see **clicker-vue**.

To get started, first you need to write a native Vue component. List any DDS' you need to power the Vue as props.

```
const VueProps = Vue.extend({
    props: {
        counter: Object,
    },
});
```

Now, we lets write out the render logic for the view as a Vue Component.

```
@Component
export class CounterVue extends VueProps {
    render(createElement) {
        return createElement("div",
            [
                createElement("span", this.counter.value),
                createElement("button",
                    {
                        on: {
                            click: () => {
                                this.counter.increment(1);
                            },
                        },
                    },
                    "+",
                ),
            ]);
    }
}
```

Once you have built your Vue component using these props, its time to drop it into Fluid. You can do this by passing it into the render() function of a SyncedComponent. Before doing this, first you need to set up the SyncedComponent config. Define the interface for the Fluid state to match the Vue props.

```
interface ICounterState {
    counter?: SharedCounter;
}
```

Now call, setConfig to initialize the counter.

```
this.setConfig<ICounterState>(
    "clicker-vue",
    {
        syncedStateId: "clicker-vue",
        fluidToView:  new Map([
            [
                "counter", {
                    type: SharedCounter.name,
                    viewKey: "counter",
                    sharedObjectCreate: SharedCounter.create,
                    listenedEvents: ["incremented"],
                },
            ],
        ]),
        defaultViewState: {},
    },
);
```

And just call the provided renderVue function from within SyncedComponent's render function and provide it your VueComponent, and the assigned synced state ID

```
public render(div: HTMLElement) {
    renderVue(div, this, "clicker-vue", CounterVue);
    return div;
}
```
And that's it! Your Vue is rendered within a Fluid component with a DDS-powered synced state

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Testing

```bash
    npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
  launch: {
    dumpio: true, // output browser console to cmd line
    slowMo: 500,
    headless: false,
  },
```
