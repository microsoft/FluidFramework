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
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
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
import { useCommentReducer, usePersonReducer, useDateReducer } from "./utils";

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

    private readonly _handleMap:
    Map<IComponentHandle, IComponentLoadable> = new Map<IComponentHandle, IComponentLoadable>();

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("comments", defaultComments);
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
            this._handleMap.set(newAvailabilityMap.handle, newAvailabilityMap);
        });
        this.root.set("person", personMap.handle);
        this._initialPersonState = { personMap };

        const dateMap = SharedMap.create(this.runtime);
        Object.entries(defaultDates).forEach(([key, defaultDate], i) => {
            dateMap.set(key, defaultDate);
        });
        this.root.set("dates", dateMap.handle);
        this._initialDateState = { dateMap };
    }

    protected async componentInitializingFromExisting() {
        this._initialCommentState = { comments: this.root.get("comments") };

        const personMap = await this.root.get<IComponentHandle<SharedMap>>("person").get();
        this._initialPersonState = { personMap };
        for (const key of personMap.keys()) {
            const person = personMap.get<IPerson>(key);
            const availabilityMap = await person.availabilityMapHandle.get();
            this._handleMap.set(person.availabilityMapHandle, availabilityMap);
        }

        this._initialDateState = { dateMap: await this.root.get<IComponentHandle<SharedMap>>("dates").get() };
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
            this._handleMap !== undefined
        ) {
            ReactDOM.render(
                <div>
                    <ScheduleItApp
                        runtime={this.runtime}
                        root={this.root}
                        handleMap={this._handleMap}
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
