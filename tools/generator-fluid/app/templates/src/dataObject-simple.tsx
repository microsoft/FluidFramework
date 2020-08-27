import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { ISharedDirectory } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

const diceValueKey = "diceValue";

/**
 * Fluid DataObject
 */
export class DiceRoller extends DataObject implements IFluidHTMLView {
    public static get DataObjectName() { return "dice-roller"; }

    public get IFluidHTMLView() { return this; }

    /**
     * The factory defines how to create an instance of the DataObject as well as the
     * dependencies of the DataObject.
     */
    public static readonly factory = new DataObjectFactory(
        DiceRoller.DataObjectName,
        DiceRoller,
        [],
        {},
    );

    /**
     * initializingFirstTime is called only once, it is executed only by the first client to open the
     * DataObject and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform DataObject setup, which can include setting an initial schema or initial values.
     */
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <DiceRollerView root={this.root} />,
            div,
        );
    }
}

interface IProps {
    root: ISharedDirectory;
}

interface IState {
    value: number;
}

class DiceRollerView extends React.Component<IProps, IState>{
    constructor(props:IProps) {
        super(props);
        
        this.state = {
            value: props.root.get(diceValueKey)
        }

        props.root.on("valueChanged", () => {
            this.setState({value: this.props.root.get(diceValueKey)})
        });
    }

    roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.props.root.set(diceValueKey, rollValue);
    };

    getDiceChar = (): string => {
        return String.fromCodePoint(0x267F + this.state.value)
    };

    render() {
        return (
            <div>
                <span style={{ fontSize: 50 }}>{this.getDiceChar()}</span>
                <button onClick={this.roll}>Roll</button>
            </div>
        );
    }
}
