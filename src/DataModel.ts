import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { Available, defaultDates, defaultPeople, Person } from "./data";
import { BadArray } from "./BadArray";

export interface IDataModel {
    dates(): readonly Date[],
    people(): readonly Person[],
    setDate(id: number, value: Date): void,
    setPerson(key: number, person: Person): void
}

export class DataModel extends PrimedComponent implements IDataModel {
    private datesKey = "dates";
    private peopleKey = "people";

    private _dates: BadArray<number>;
    private _people: BadArray<Person>;

    protected async componentInitializingFirstTime() {
        // Initialize the data model
        let dates = BadArray.create<number>(this.runtime);
        for (let date of defaultDates) {
            dates.add(date.valueOf());
        }
        let people = BadArray.create(this.runtime);
        for (let p of defaultPeople) {
            people.add(p);
        }

        this.root.set(this.datesKey, dates.getHandle());
        this.root.set(this.peopleKey, people.getHandle());
    }

    protected async componentHasInitialized() {
        // set up local refs to the DDSes so they're easily accessible from synchronous code
        this._dates = await this.root.get<IComponentHandle>(this.datesKey).get<BadArray<number>>();
        this._people = await this.root.get<IComponentHandle>(this.peopleKey).get<BadArray<Person>>();
    }

    public setDate = (id: number, value: Date): void => {
        this._dates.set(id, value.valueOf());
    };

    public setPerson = (key: number, person: Person): void => {
        this._people.set(key, person);
    };

    public setAvailability = (personKey: number, dayKey: number, available: Available) => {
        let person = this._people.get(personKey);
        person.availability[dayKey] = available;
        this.setPerson(personKey, person);
    };

    public setName = (personKey: number, name: string) => {
        let person = this._people.get(personKey);
        person.name = name;
        this.setPerson(personKey, person);
    };

    public dates = (): Date[] => {
        return this._dates.all().map((value: number) => {
            return new Date(value);
        });
    };

    public people = (): Person[] => {
        return this._people.all();
    }

}

// const {setDate(id, date), setPeople(key, name, availability[0, 1, 2])} = action;

// const {getDates, getPeople: {name, availability[]}} = selectors;
