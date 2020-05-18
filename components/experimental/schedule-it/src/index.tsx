/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { FluidComponentMap, IFluidComponent } from "@microsoft/fluid-aqueduct-react";
import {
    defaultComments,
    defaultPeople,
    defaultDates,
} from "./data";
import {
    IDateState,
    ICommentState,
    IPersonState,
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

    private _initialPersonState?: IPersonState;
    private _initialDateState?: IDateState;
    private _initialCommentState?: ICommentState;

    private readonly _fluidComponentMap: FluidComponentMap = new Map<IComponentHandle, IFluidComponent>();

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
            // Optional Step: You can preload the nested components before initial render,
            // but you can also pass an empty handle map to allow them to be dynamically loaded in on fetch
            // The only requirement is that a Map (empty or otherwise) be constructed and passed in
            // Do NOT set the isListened optional param on the map items to true,
            // unless you have already explicitly set listeners for this component's changes.
            // Otherwise, any updates to it will NOT trigger state updates in your component
            this._fluidComponentMap.set(newAvailabilityMap.handle, {
                component: newAvailabilityMap,
            });
        });
        this.root.set(PeopleRootKey, personMap.handle);
        this._initialPersonState = { personMap };

        const dateMap = SharedMap.create(this.runtime);
        Object.entries(defaultDates).forEach(([key, defaultDate], i) => {
            dateMap.set(key, defaultDate);
        });
        this.root.set(DatesRootKey, dateMap.handle);
        this._initialDateState = { dateMap };
    }

    protected async componentInitializingFromExisting() {
        this._initialCommentState = { comments: this.root.get(CommentsRootKey) };

        const personMap = await this.root.get<IComponentHandle<SharedMap>>(PeopleRootKey).get();
        this._initialPersonState = { personMap };
        for (const key of personMap.keys()) {
            const person = personMap.get<IPerson>(key);
            const availabilityMap = await person.availabilityMapHandle.get();
            this._fluidComponentMap.set(person.availabilityMapHandle, {
                component: availabilityMap,
            });
        }

        this._initialDateState = { dateMap: await this.root.get<IComponentHandle<SharedMap>>(DatesRootKey).get() };
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
    const [commentState, commentDispatch] = useCommentReducer(props);
    const [personState, personDispatch, personFetch] = usePersonReducer(props);
    const [dateState, dateDispatch] = useDateReducer(props);

    return (
        <div>
            <PrimedContext.Provider
                value={{
                    comments: commentState.comments,
                    commentDispatch,
                    personMap: personState.personMap,
                    personDispatch,
                    personFetch,
                    dateMap: dateState.dateMap,
                    dateDispatch,
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
