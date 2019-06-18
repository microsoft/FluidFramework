var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { RootComponent, StockContainerRuntimeFactory } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import { DistributedSetValueType, MapExtension, registerDefaultValueType, CounterValueType, } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";
const pkg = require("../package.json");
export const ClickerName = pkg.name;
/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends RootComponent {
    /**
     * Do setup work here
     */
    created() {
        const _super = Object.create(null, {
            created: { get: () => super.created }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // This allows the RootComponent to do setup. In this case it creates the root map
            yield _super.created.call(this);
            this.root.set("clicks", 0, CounterValueType.Name);
        });
    }
    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    static load(runtime, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const clicker = new Clicker(runtime, context, Clicker.SupportedInterfaces);
            yield clicker.initialize();
            return clicker;
        });
    }
    // start IComponentHTMLViewable
    /**
     * Will return a new Clicker view
     */
    addView(host) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get our counter object that we set in initialize and pass it in to the view.
            const counter = this.root.get("clicks");
            const div = document.createElement("div");
            ReactDOM.render(React.createElement(CounterReactView, { map: this.root, counter: counter }), div);
            return div;
        });
    }
}
Clicker.SupportedInterfaces = ["IComponentHTMLViewable", "IComponentRouter"];
class CounterReactView extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            value: this.props.counter.value
        };
    }
    componentDidMount() {
        // set a listener so when the counter increments we will update our state
        // counter is annoying because it only allows you to register one listener.
        // this causes problems when we have multiple views off the same counter.
        // so we are listening to the map
        this.props.map.on("valueChanged", () => {
            this.setState({ value: this.props.counter.value });
        });
    }
    render() {
        return (React.createElement("div", null,
            React.createElement("span", null, this.state.value),
            React.createElement("button", { onClick: () => { this.props.counter.increment(1); } }, "+")));
    }
}
// ----- COMPONENT SETUP STUFF -----
/**
 * This is where we do component setup.
 */
export function instantiateComponent(context) {
    return __awaiter(this, void 0, void 0, function* () {
        // Register default map value types (Register the DDS we care about)
        // We need to register the Map and the Counter so we can create a root and a counter on that root
        registerDefaultValueType(new DistributedSetValueType());
        registerDefaultValueType(new CounterValueType());
        const dataTypes = new Map();
        dataTypes.set(MapExtension.Type, new MapExtension());
        // Create a new runtime for our component
        const runtime = yield ComponentRuntime.load(context, dataTypes);
        // Create a new instance of our component
        const counterNewP = Clicker.load(runtime, context);
        // Add a handler for the request() on our runtime to send it to our component
        // This will define how requests to the runtime object we just created gets handled
        // Here we want to simply defer those requests to our component
        runtime.registerRequestHandler((request) => __awaiter(this, void 0, void 0, function* () {
            const counter = yield counterNewP;
            return counter.request(request);
        }));
        return runtime;
    });
}
// ----- CONTAINER STUFF -----
/**
 * This will get called by the Container as part of setup
 * We provide all the components we will care about as a registry.
 */
export function instantiateRuntime(context) {
    return __awaiter(this, void 0, void 0, function* () {
        return StockContainerRuntimeFactory.instantiateRuntime(context, ClickerName, new Map([
            [ClickerName, Promise.resolve({ instantiateComponent })]
        ]));
    });
}
//# sourceMappingURL=index.js.map