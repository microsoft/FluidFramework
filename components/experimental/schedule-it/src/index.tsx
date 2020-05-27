/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { FluidComponentMap, IFluidComponent } from "@fluidframework/aqueduct-react";
import {
    defaultComments,
    defaultPeople,
    defaultDates,
} from "./data";
import {
    IDateViewState,
    ICommentViewState,
    IPersonViewState,
    IPerson,
    ScheduleItProps,
} from "./interface";
import { PrimedContext } from "./context";
import { ScheduleItView } from "./view";
import {
    useCommentReducer,
    usePersonReducer,
    useDateReducer,
    CommentsRootKey,
    DatesRootKey,
    PeopleRootKey,
} from "./utils";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ScheduleItName = pkg.name as string;

/**
 * ScheduleIt example using Fluid React hooks
 */
export class ScheduleIt extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private _initialPersonState?: IPersonViewState;
    private _initialDateState?: IDateViewState;
    private _initialCommentState?: ICommentViewState;

    private readonly _fluidComponentMap: FluidComponentMap = new Map<string, IFluidComponent>();

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set(CommentsRootKey, defaultComments);
        this._initialCommentState = { comments: defaultComments };

        const personMap = SharedMap.create(this.runtime);
        Object.entries(defaultPeople).forEach(([key, defaultPerson], i) => {
            const newAvailabilityMap = SharedMap.create(this.runtime);
            Object.entries(defaultPerson.availabilityMap).forEach(([dateKey, availabilityItem], j) => {
                newAvailabilityMap.set(dateKey, availabilityItem);
            });
            const newPerson: IPerson = {
                key,
                name: defaultPerson.name,
                availabilityMapHandle: newAvailabilityMap.handle as IComponentHandle<SharedMap>,
            };
            personMap.set(key, newPerson);
            // Do NOT set the isListened optional param on the map items to true,
            // unless you have already explicitly set listeners for this component's changes.
            // Otherwise, any updates to it will NOT trigger state updates in your component
            this._fluidComponentMap.set(newAvailabilityMap.handle.path, {
                component: newAvailabilityMap,
            });
        });
        this.root.set(PeopleRootKey, personMap.handle);
        this._fluidComponentMap.set(personMap.handle.path, { component: personMap });
        this._initialPersonState = { personMap };

        const dateMap = SharedMap.create(this.runtime);
        Object.entries(defaultDates).forEach(([key, defaultDate], i) => {
            dateMap.set(key, defaultDate);
        });
        this._fluidComponentMap.set(dateMap.handle.path, { component: dateMap });
        this.root.set(DatesRootKey, dateMap.handle);
        this._initialDateState = { dateMap };
    }

    protected async componentInitializingFromExisting() {
        this._initialCommentState = { comments: this.root.get(CommentsRootKey) };

        const personMap = await this.root.get<IComponentHandle<SharedMap>>(PeopleRootKey).get();
        this._initialPersonState = { personMap };
        this._fluidComponentMap.set(personMap.handle.path, { component: personMap });
        for (const key of personMap.keys()) {
            const person = personMap.get<IPerson>(key);
            const availabilityMap = await person.availabilityMapHandle.get();
            this._fluidComponentMap.set(person.availabilityMapHandle.path, {
                component: availabilityMap,
            });
        }

        const dateMap = await this.root.get<IComponentHandle<SharedMap>>(DatesRootKey).get();
        this._initialDateState = { dateMap };
        this._fluidComponentMap.set(dateMap.handle.path, { component: dateMap });
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ScheduleIt view
     */
    public render(div: HTMLElement) {
        if (
            this._initialDateState !== undefined &&
            this._initialPersonState !== undefined &&
            this._initialCommentState !== undefined &&
            this._fluidComponentMap !== undefined
        ) {
            ReactDOM.render(
                <div id="schedule-it-app">
                    <ScheduleItApp
                        runtime={this.runtime}
                        root={this.root}
                        fluidComponentMap={this._fluidComponentMap}
                        initialCommentState={this._initialCommentState}
                        initialPersonState={this._initialPersonState}
                        initialDateState={this._initialDateState}
                    />
                </div>,
                div,
            );
            return div;
        }
    }
    // #endregion IComponentHTMLView
}

function ScheduleItApp(props: ScheduleItProps) {
    const [commentState, commentReducer] = useCommentReducer(props);
    const [personState, personReducer, personSelector] = usePersonReducer(props);
    const [dateState, dateReducer] = useDateReducer(props);

    return (
        <div>
            <PrimedContext.Provider
                value={{
                    commentState,
                    personState,
                    dateState,
                    commentReducer,
                    personReducer,
                    personSelector,
                    dateReducer,
                }}
            >
                <ScheduleItView />
            </PrimedContext.Provider>
        </div>
    );
}

// ----- FACTORY SETUP -----
export const ScheduleItInstantiationFactory = new PrimedComponentFactory(
    ScheduleItName,
    ScheduleIt,
    [SharedMap.getFactory()],
    {},
);
export const fluidExport = ScheduleItInstantiationFactory;
