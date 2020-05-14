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
import { ISharedDirectory, SharedMap } from "@microsoft/fluid-map";
import { useReducerFluid } from "@microsoft/fluid-aqueduct-react";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import {
    defaultComments,
    defaultPeople,
    defaultDates,
    CommentReducer,
    PersonReducer,
    DateReducer,
    PersonSelector,
} from "./dataModel";
import {
    IDateState,
    ICommentReducer,
    ICommentState,
    IPersonState,
    IPersonReducer,
    IDateReducer,
    IPerson,
    IPersonSelector,
} from "./interface";
import { PrimedContext } from "./context";
import { ScheduleItView } from "./view";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ScheduleItName = pkg.name as string;

interface ScheduleItProps {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    handleMap: Map<IComponentHandle, IComponentLoadable>;
    initialPersonState: IPersonState;
    initialDateState: IDateState;
    initialCommentState: ICommentState;
}

function useCommentReducer(props: ScheduleItProps) {
    const { handleMap, root, runtime } = props;
    const rootToInitialStateComments = new Map<string, keyof ICommentState>();
    rootToInitialStateComments.set("comments", "comments");
    const stateToRootComments = new Map<keyof ICommentState, string>();
    stateToRootComments.set("comments", "comments");
    const commentProps = {
        root,
        runtime,
        handleMap,
        initialState: props.initialCommentState,
        reducer: CommentReducer,
        selector: {},
        rootToInitialState: rootToInitialStateComments,
        stateToRoot: stateToRootComments,
    };
    return useReducerFluid<ICommentState, ICommentReducer, {}>(commentProps);
}

function usePersonReducer(props: ScheduleItProps) {
    const { handleMap, root, runtime } = props;
    const stateToRootPerson = new Map<keyof IPersonState, string>();
    stateToRootPerson.set("personMap", "person");
    const personProps = {
        root,
        runtime,
        handleMap,
        initialState: props.initialPersonState,
        reducer: PersonReducer,
        selector: PersonSelector,
        stateToRoot: stateToRootPerson,
    };
    return useReducerFluid<IPersonState, IPersonReducer, IPersonSelector>(personProps);
}

function useDateReducer(props: ScheduleItProps) {
    const { handleMap, root, runtime } = props;
    const stateToRootDates = new Map<keyof IDateState, string>();
    stateToRootDates.set("dateMap", "dates");
    const dateProps = {
        root,
        runtime,
        handleMap,
        initialState: props.initialDateState,
        reducer: DateReducer,
        selector: {},
        stateToRoot: stateToRootDates,
    };
    return useReducerFluid<IDateState, IDateReducer, {}>(dateProps);
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

// ----- FACTORY SETUP -----
export const ScheduleItInstantiationFactory = new PrimedComponentFactory(ScheduleItName, ScheduleIt, [SharedMap.getFactory()], {});
export const fluidExport = ScheduleItInstantiationFactory;
