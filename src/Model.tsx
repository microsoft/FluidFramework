import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import {
  IComponentHandle,
  IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { BadArray, defaultDatesNumbers, defaultPeople } from "./utils";
import {
  AvailabilityType,
  IPersonType,
  IViewProps,
  PrimedContext,
  ICommentType,
  IViewActions,
  IViewSelectors,
} from "./provider";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { ScheduleIt } from "./View";

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
  private _commentsKey = "comment";

  private _dates: SharedObjectSequence<number> | undefined;
  private _people: SharedObjectSequence<IPersonType> | undefined;
  private _comments: SharedObjectSequence<ICommentType> | undefined;

  private _selectors;

  public get IComponentHTMLVisual() {
    return this;
  }

  protected async componentInitializingFirstTime() {
    // Initialize the data model
    let dates = SharedObjectSequence.create<number>(this.runtime);
    this.root.set(this._datesKey, dates.handle);

    let people = SharedObjectSequence.create<IPersonType>(this.runtime);
    this.root.set(this._peopleKey, people.handle);

    let comments = SharedObjectSequence.create<ICommentType>(this.runtime);
    this.root.set(this._commentsKey, comments.handle);

    // if (this.context.leader) {
    BadArray.push<number>(dates, defaultDatesNumbers);
    BadArray.push<IPersonType>(people, defaultPeople);
    BadArray.push<ICommentType>(comments, undefined);
    // }
  }

  protected async componentHasInitialized() {
    // set up local refs to the DDSes so they're easily accessible from synchronous code
    this._dates = await this.root
      .get<IComponentHandle>(this._datesKey)
      .get<SharedObjectSequence<number>>();
    this._people = await this.root
      .get<IComponentHandle>(this._peopleKey)
      .get<SharedObjectSequence<IPersonType>>();
    this._comments = await this.root
      .get<IComponentHandle>(this._commentsKey)
      .get<SharedObjectSequence<ICommentType>>();
  }

  private setPerson = (index: number, person: IPersonType): void => {
    if (this._people) {
      BadArray.set(this._people, this.context.hostRuntime, index, person);
    }
  };

  public setDate: IViewActions["setDate"] = (
    index: number,
    value: Date
  ): void => {
    if (this._dates) {
      BadArray.set(
        this._dates,
        this.context.hostRuntime,
        index,
        value.valueOf()
      );
    } else {
    }
  };

  public setAvailability: IViewActions["setAvailability"] = (
    personIndex: number,
    dayIndex: number,
    value: number | string
  ) => {
    if (this._people) {
      let person = BadArray.get(this._people, personIndex);
      person.availability[dayIndex] = AvailabilityType[value];
      this.setPerson(personIndex, person);
    }
  };

  public setName: IViewActions["setName"] = (
    personIndex: number,
    name: string
  ) => {
    if (this._people) {
      let person = BadArray.get(this._people, personIndex);
      person.name = name;
      this.setPerson(personIndex, person);
    }
  };

  public addRow: IViewActions["addRow"] = () => {
    if (this._people) {
      BadArray.push(this._people, [
        {
          name: undefined,
          availability: [
            AvailabilityType.No,
            AvailabilityType.No,
            AvailabilityType.No,
          ],
        },
      ]);
    }
  };

  public removeRow: IViewActions["removeRow"] = () => {
    if (this._people) {
      BadArray.pop(this._people);
    }
  };

  public addComment: IViewActions["addComment"] = (
    name: string,
    message: string
  ): void => {
    if (this._comments) {
      const length = this._comments.getLength();
      BadArray.push(this._comments, [{ name, message }]);
    }
  };

  public get dates(): IViewSelectors["dates"] {
    if (!this._dates) {
      return [];
    }
    return this._dates.getItems(0).map((value: number) => {
      return new Date(value);
    });
  }

  public get people(): IViewSelectors["people"] {
    if (!this._people) {
      return [];
    }
    return this._people.getItems(0);
  }

  public get comments(): IViewSelectors["comments"] {
    if (!this._comments) {
      return [];
    }
    return this._comments.getItems(0);
  }

  // todo this should just be a data component with no rendering; rendering should be done elsewhere
  public render(div: HTMLElement) {
    // const ctx = this.reactContext;
    console.log(`render ${this.runtime.clientId}!`);
    const actions = this.actions;
    this._selectors = this.selectors;
    const rerender = () => {
      console.log(`rerender ${this.runtime.clientId}!`);
      ReactDOM.render(
        <PrimedContext.Provider value={{ actions, selectors: this._selectors }}>
          <ScheduleIt />
        </PrimedContext.Provider>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", () => {
      console.log("valueChanged");
      rerender();
    });
    if (this._people) {
      this._people.on("sequenceDelta", (event) => {
        console.log(
          `${this.runtime.clientId} people sequenceDelta: op[${
            event.deltaOperation
          }] args[${JSON.stringify(event.deltaArgs.operation)}]`
        );
        this._selectors = this.selectors;
        rerender();
      });
    }
    if (this._dates) {
      this._dates.on("sequenceDelta", (event) => {
        console.log(
          `${this.runtime.clientId} dates sequenceDelta: op[${
            event.deltaOperation
          }] args[${JSON.stringify(event.deltaArgs.operation)}]`
        );
        this._selectors = this.selectors;
        rerender();
      });
    }
    if (this._comments) {
      this._comments.on("sequenceDelta", (event) => {
        console.log(
          `${this.runtime.clientId} dates sequenceDelta: op[${
            event.deltaOperation
          }] args[${JSON.stringify(event.deltaArgs.operation)}]`
        );
        this._selectors = this.selectors;
        rerender();
      });
    }
  }

  //#region IViewProps
  public get actions() {
    return {
      setAvailability: this.setAvailability,
      setName: this.setName,
      setDate: this.setDate,
      addRow: this.addRow,
      removeRow: this.removeRow,
      addComment: this.addComment,
    };
  }

  public get selectors() {
    return {
      dates: this.dates,
      people: this.people,
      comments: this.comments,
    };
  }
  //#endregion

  // private _reactContext: React.Context<IViewProps>;
  // public get reactContext(): React.Context<IViewProps> {
  //     if (!this._reactContext) {
  //         this._reactContext = React.createContext<IViewProps>(this);
  //     }
  //     return this._reactContext;
  // }
}

// let _reactContext: React.Context<IViewProps>;

// const reactContext: React.Context<IViewProps> = () => {
//     if(!this._reactContext) {
//         this._reactContext = React.createContext<IViewProps>(this);
//     }
//     return this._reactContext;
// }
