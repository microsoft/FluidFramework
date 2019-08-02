/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { PrimedComponent, SimpleComponentInstantiationFactory, SimpleModuleInstantiationFactory, } from "@prague/aqueduct";
import { CounterValueType, SharedMap, } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";
// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const ClickerName = pkg.name;
/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent {
    /**
     * Do setup work here
     */
    create() {
        const _super = Object.create(null, {
            create: { get: () => super.create }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // This allows the PrimedComponent to create the root map
            yield _super.create.call(this);
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
            const clicker = new Clicker(runtime, context, Clicker.supportedInterfaces);
            yield clicker.initialize();
            return clicker;
        });
    }
    // start IComponentHTMLVisual
    /**
     * Will return a new Clicker view
     */
    render(div) {
        // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        ReactDOM.render(React.createElement(CounterReactView, { counter: counter }), div);
        return div;
    }
}
Clicker.supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender",
    "IComponentRouter"];
class CounterReactView extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            value: this.props.counter.value,
        };
    }
    componentDidMount() {
        this.props.counter.on("incremented", (incrementValue, currentValue) => {
            this.setState({ value: currentValue });
        });
    }
    render() {
        return (React.createElement("div", null,
            React.createElement("span", null, this.state.value),
            React.createElement("button", { onClick: () => { this.props.counter.increment(1); } }, "+")));
    }
}
// ----- COMPONENT SETUP STUFF -----
export const ClickerInstantiationFactory = new SimpleComponentInstantiationFactory([
    SharedMap.getFactory([new CounterValueType()]),
], Clicker.load);
export const fluidExport = new SimpleModuleInstantiationFactory(ClickerName, new Map([
    [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
]));
// Included for back compat - can remove in 0.7 once fluidExport is default
export function instantiateRuntime(context) {
    return __awaiter(this, void 0, void 0, function* () {
        return fluidExport.instantiateRuntime(context);
    });
}
// Included for back compat - can remove in 0.7 once fluidExport is default
export function instantiateComponent(context) {
    return __awaiter(this, void 0, void 0, function* () {
        return fluidExport.instantiateComponent(context);
    });
}
//# sourceMappingURL=index.js.map