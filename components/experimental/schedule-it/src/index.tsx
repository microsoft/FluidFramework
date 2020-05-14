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
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { defaultComments, defaultPeople, defaultDates, CommentReducer, PersonReducer, DateReducer } from "./dataModel";
import {
    IDateState,
    ICommentReducer,
    ICommentState,
    IPersonState,
    IPersonReducer,
    IDateReducer,
    IPerson,
} from "./interface";
import { PrimedContext } from "./context";
import { ScheduleItView } from "./view";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ScheduleItName = pkg.name as string;

interface ScheduleItProps {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    initialPersonState: IPersonState;
    initialDateState: IDateState;
    initialCommentState: ICommentState;
}

function useCommentReducer(props: ScheduleItProps) {
    const { root, runtime } = props;
    const rootToInitialStateComments = new Map<string, keyof ICommentState>();
    rootToInitialStateComments.set("comments", "comments");
    const stateToRootComments = new Map<keyof ICommentState, string>();
    stateToRootComments.set("comments", "comments");
    const commentProps = {
        root,
        runtime,
        initialState: props.initialCommentState,
        reducer: CommentReducer,
        rootToInitialState: rootToInitialStateComments,
        stateToRoot: stateToRootComments,
    };
    return useReducerFluid<ICommentState, ICommentReducer>(commentProps);
}

function usePersonReducer(props: ScheduleItProps) {
    const { root, runtime } = props;
    const stateToRootPerson = new Map<keyof IPersonState, string>();
    stateToRootPerson.set("personMap", "person");
    const personProps = {
        root,
        runtime,
        initialState: props.initialPersonState,
        reducer: PersonReducer,
        stateToRoot: stateToRootPerson,
    };
    return useReducerFluid<IPersonState, IPersonReducer>(personProps);
}

function useDateReducer(props: ScheduleItProps) {
    const { root, runtime } = props;
    const stateToRootDates = new Map<keyof IDateState, string>();
    stateToRootDates.set("dateMap", "dates");
    const dateProps = {
        root,
        runtime,
        initialState: props.initialDateState,
        reducer: DateReducer,
        stateToRoot: stateToRootDates,
    };
    return useReducerFluid<IDateState, IDateReducer>(dateProps);
}

function ScheduleItApp(props: ScheduleItProps) {
    const [commentState, commentDispatch] = useCommentReducer(props);
    const [personState, personDispatch] = usePersonReducer(props);
    const [dateState, dateDispatch] = useDateReducer(props);

    return (
        <div>
            <PrimedContext.Provider
                value={{
                    comments: commentState.comments,
                    commentDispatch,
                    personMap: personState.personMap,
                    personDispatch,
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

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("comments", defaultComments);
        this._initialCommentState = { comments: defaultComments };

        const personMap = SharedMap.create(this.runtime);
        Object.entries(defaultPeople).forEach(([key, defaultPerson], i) => {
            const newAvailabilityMap = SharedMap.create(this.runtime);
            const newPerson: IPerson = {
                key,
                name: "",
                availabilityMap: newAvailabilityMap,
                availabilityMapHandle: newAvailabilityMap.handle,
            };
            personMap.set(key, newPerson);
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
        this._initialPersonState = { personMap: await this.root.get<IComponentHandle<SharedMap>>("person").get() };
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
            this._initialCommentState !== undefined
        ) {
            ReactDOM.render(
                <div>
                    <ScheduleItApp
                        runtime={this.runtime}
                        root={this.root}
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
export const ScheduleItInstantiationFactory = new PrimedComponentFactory(ScheduleItName, ScheduleIt, [], {});
export const fluidExport = ScheduleItInstantiationFactory;
