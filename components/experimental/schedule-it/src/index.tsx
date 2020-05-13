/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { ISharedDirectory } from "@microsoft/fluid-map";
import {
    FluidProps,
    FluidReducerProps,
    FluidFunctionalComponentState,
    FluidReactComponent,
    useStateFluid,
    useReducerFluid,
    IFluidReducer,
    createFluidContext,
} from "@microsoft/fluid-aqueduct-react";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { defaultComments, defaultPeople, defaultDates, CommentReducer, PersonReducer, DateReducer } from "./dataModel";
import {
    IDateState,
    ICommentReducer,
    ICommentState,
    IPersonState,
    IPersonReducer,
    IDateReducer,
    IDateMap,
    IPersonMap,
} from "./interface";
import { PrimedContext } from "./context";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ScheduleItName = pkg.name as string;

interface ScheduleItProps {
    root: ISharedDirectory,
}

function useCommentReducer(props: ScheduleItProps) {
    const { root } = props;
    const rootToInitialStateComments = new Map<string, keyof ICommentState>();
    rootToInitialStateComments.set("comments", "comments");
    const stateToRootComments = new Map<keyof ICommentState, string>();
    stateToRootComments.set("comments", "comments");
    const commentProps = {
        root,
        initialState: { comments: defaultComments },
        reducer: CommentReducer,
        rootToInitialState: rootToInitialStateComments,
        stateToRoot: stateToRootComments,
    };
    return useReducerFluid<ICommentState, ICommentReducer>(commentProps);
}

function usePersonReducer(props: ScheduleItProps) {
    const { root } = props;
    const rootToInitialStatePerson = new Map<string, keyof IPersonState>();
    rootToInitialStatePerson.set("person", "personMap");
    const stateToRootPerson = new Map<keyof IPersonState, string>();
    stateToRootPerson.set("personMap", "person");
    const personProps = {
        root,
        initialState: { personMap: defaultPeople },
        reducer: PersonReducer,
        rootToInitialState: rootToInitialStatePerson,
        stateToRoot: stateToRootPerson,
    };
    return useReducerFluid<IPersonState, IPersonReducer>(personProps);
}

function useDateReducer(props: ScheduleItProps) {
    const { root } = props;
    const rootToInitialStateDates = new Map<string, keyof IDateState>();
    rootToInitialStateDates.set("dates", "dateMap");
    const stateToRootDates = new Map<keyof IDateState, string>();
    stateToRootDates.set("dateMap", "dates");
    const dateProps = {
        root,
        initialState: { dateMap: defaultDates },
        reducer: DateReducer,
        rootToInitialState: rootToInitialStateDates,
        stateToRoot: stateToRootDates,
    };
    return useReducerFluid<IDateState, IDateReducer>(dateProps);
}

function ScheduleItView(props: ScheduleItProps) {
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
                <button onClick={() => { commentDispatch("add"); }}>+</button>
            </PrimedContext.Provider>
        </div>
    );
}

/**
 * ScheduleIt example using Fluid React hooks
 */
export class ScheduleIt extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("comments", defaultComments);
        this.root.set("person", defaultPeople);
        this.root.set("dates", defaultDates);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ScheduleIt view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <ScheduleItView
                    root={this.root}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ScheduleItInstantiationFactory = new PrimedComponentFactory(ScheduleItName, ScheduleIt, [], {});
export const fluidExport = ScheduleItInstantiationFactory;
