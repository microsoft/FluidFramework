import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import { EventEmitter } from "events";
import * as React from "react";
import * as ReactDOM from "react-dom";

const diceValueKey = "diceValue";

export interface IDiceRoller extends EventEmitter {
    readonly value: number;
    roll: () => void;
    on(event: "diceRolled", listener: () => void): this;
}

export class DiceRoller extends PrimedComponent
    implements IDiceRoller, IComponentHTMLView {
    public static get ComponentName() {
        return "DiceRoller";
    }

    public get IComponentHTMLView() { return this; }

    public static readonly factory = new PrimedComponentFactory(
        DiceRoller.ComponentName,
        DiceRoller,
        [],
        {},
    );

    protected async componentInitializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === diceValueKey) {
                this.emit("diceRolled");
            }
        });
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <DiceRollerView model={this} />,
            div,
        );
    }

    public get value() {
        return this.root.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };
}

interface IDiceRollerViewProps {
    model: IDiceRoller;
}

export const DiceRollerView: React.FC<IDiceRollerViewProps> =
    (props: IDiceRollerViewProps) => {
    const [diceValue, setDiceValue] = React.useState(props.model.value);

    React.useEffect(() => {
        const onDiceRolled = () => {
            setDiceValue(props.model.value);
        };
        props.model.on("diceRolled", onDiceRolled);
        return () => {
            props.model.off("diceRolled", onDiceRolled);
        };
    }, [props.model]);

    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    const diceChar = String.fromCodePoint(0x267F + diceValue);

    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={props.model.roll}>Roll</button>
        </div>
    );
};

export const fluidExport = DiceRoller.factory;

