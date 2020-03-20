import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { BadArray } from "./BadArray";
import { defaultDatesNumbers, defaultPeople, defaultDates } from "./data";
import { FluidApp } from "./FluidApp";
import { AvailabilityType, IPersonType, IViewProps } from "./provider.types";
import { PrimedContext } from "./provider";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";


// export interface IDataModel {
//     dates(): readonly Date[],
//     people(): readonly IPersonType[],
//     setDate(id: number, value: Date): void,
//     setPerson(key: number, person: IPersonType): void
// }

export class DataModel extends PrimedComponent
    implements IViewProps, IComponentHTMLVisual {
    private _datesKey = "dates";
    private _peopleKey = "people";

    private _dates: SharedObjectSequence<number>;
    private _people: SharedObjectSequence<IPersonType>;

    public get IComponentHTMLVisual() {
        return this;
    }

    protected async componentInitializingFirstTime() {
        // Initialize the data model
        let dates = SharedObjectSequence.create<number>(this.runtime);
        this.root.set(this._datesKey, dates.handle);
        
        let people = SharedObjectSequence.create<IPersonType>(this.runtime);
        this.root.set(this._peopleKey, people.handle);
        // if (this.context.leader) {
            BadArray.push<number>(dates, defaultDatesNumbers);
            BadArray.push<IPersonType>(people, defaultPeople);
        // }
    }

    protected async componentHasInitialized() {
        // set up local refs to the DDSes so they're easily accessible from synchronous code
        this._dates = await this.root.get<IComponentHandle>(this._datesKey).get<SharedObjectSequence<number>>();
        this._people = await this.root.get<IComponentHandle>(this._peopleKey).get<SharedObjectSequence<IPersonType>>();
    }

    public setDate = (index: number, value: Date): void => {
        BadArray.set(this._dates, this.context.hostRuntime, index, value.valueOf());
    };

    public setPerson = (index: number, person: IPersonType): void => {
        BadArray.set(this._people, this.context.hostRuntime, index, person);
    };

    public setAvailability = (personIndex: number, dayIndex: number, available: AvailabilityType) => {
        let person = BadArray.get(this._people, personIndex);
        person[dayIndex] = available;
        this.setPerson(personIndex, person);
    };

    public setName = (personIndex: number, name: string) => {
        let person = BadArray.get(this._people, personIndex);
        person.name = name;
        this.setPerson(personIndex, person);
    };

    public get dates(): Date[] {
        if (!this._dates) {
            return [];
        }
        return this._dates.getItems(0).map((value: number) => {
            return new Date(value);
        });
    };

    public get people(): IPersonType[] {
        if (!this._people) {
            return [];
        }
        return this._people.getItems(0);
    }

    // todo this should just be a data component with no rendering; rendering should be done elsewhere
    public render(div: HTMLElement) {
        // const ctx = this.reactContext;
        console.log(`render ${this.runtime.clientId}!`);
        const actions = this.actions;
        const selectors = this.selectors;
        const rerender = () => {
            console.log(`rerender ${this.runtime.clientId}!`);
            ReactDOM.render(
                <PrimedContext.Provider value={{ actions, selectors }}>
                    <FluidApp />
                </PrimedContext.Provider>,
                div
            );
        };

        rerender();
        this.root.on("valueChanged", () => {
            console.log("valueChanged");
            rerender();
        });
        this._people.on("sequenceDelta", (event) => {
            console.log(`${this.runtime.clientId} people sequenceDelta: op[${event.deltaOperation}] args[${JSON.stringify(event.deltaArgs.operation)}]`);
            rerender();
        });
        this._dates.on("sequenceDelta", (event) => {
            console.log(`${this.runtime.clientId} dates sequenceDelta: op[${event.deltaOperation}] args[${JSON.stringify(event.deltaArgs.operation)}]`);
            rerender();
        });
    }

    //#region IViewProps
    public get actions() {
        return {
            setAvailability: this.setAvailability,
            setName: this.setName,
            setDate: this.setDate,
            addRow: () => { },
            removeRow: () => { },
            addComment: (name: string, message: string) => { },
        }
    };

    public get selectors() {
        return {
            dates: this.dates,
            people: this.people,
            comments: []
        }
    };
    //#endregion

    private _reactContext: React.Context<IViewProps>;
    public get reactContext(): React.Context<IViewProps> {
        if (!this._reactContext) {
            this._reactContext = React.createContext<IViewProps>(this);
        }
        return this._reactContext;
    }
}

// let _reactContext: React.Context<IViewProps>;

// const reactContext: React.Context<IViewProps> = () => {
//     if(!this._reactContext) {
//         this._reactContext = React.createContext<IViewProps>(this);
//     }
//     return this._reactContext;
// }

