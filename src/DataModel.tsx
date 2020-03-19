import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { BadArray } from "./BadArray";
import { defaultDatesNumbers, defaultPeople } from "./data";
import { FluidApp } from "./FluidApp";
import { AvailabilityType, IPersonType, IViewProps } from "./provider.types";
import { PrimedContext } from "./provider";


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

    private _dates: BadArray<number>;
    private _people: BadArray<IPersonType>;

    public get IComponentHTMLVisual() {
        return this;
    }

    protected async componentInitializingFirstTime() {
        // Initialize the data model
        let dates = BadArray.createWithData<number>(this.runtime, this.context.hostRuntime, defaultDatesNumbers);
        let people = BadArray.createWithData<IPersonType>(this.runtime, this.context.hostRuntime, defaultPeople);

        this.root.set(this._datesKey, dates.getHandle());
        this.root.set(this._peopleKey, people.getHandle());
    }

    protected async componentHasInitialized() {
        // set up local refs to the DDSes so they're easily accessible from synchronous code
        this._dates = await this.root.get<IComponentHandle>(this._datesKey).get<BadArray<number>>();
        this._people = await this.root.get<IComponentHandle>(this._peopleKey).get<BadArray<IPersonType>>();
    }

    public setDate = (id: number, value: Date): void => {
        this._dates.set(id, value.valueOf());
    };

    public setPerson = (key: number, person: IPersonType): void => {
        this._people.set(key, person);
    };

    public setAvailability = (personKey: number, dayKey: number, available: AvailabilityType) => {
        let person = this._people.get(personKey);
        person.availability[dayKey] = available;
        this.setPerson(personKey, person);
    };

    public setName = (personKey: number, name: string) => {
        let person = this._people.get(personKey);
        person.name = name;
        this.setPerson(personKey, person);
    };

    public get dates(): Date[] {
        if (!this._dates) {
            return [];
        }
        return this._dates.all().map((value: number) => {
            return new Date(value);
        });
    };

    public get people(): IPersonType[] {
        if (!this._people) {
            return [];
        }
        return this._people.all();
    }

    // todo this should just be a data component with no rendering; rendering should be done elsewhere
    public render(div: HTMLElement) {
        // const ctx = this.reactContext;
        console.log(`render ${this.runtime.clientId}!`);
        const actions = this.actions;
        const selectors = this.selectors;
        const rerender = () => {
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

