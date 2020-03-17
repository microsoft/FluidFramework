/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { ISegment, LocalReference, PropertySet } from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SequenceDeltaEvent, SequenceMaintenanceEvent, SharedString } from "@microsoft/fluid-sequence";
declare type LeafAction = (position: number, segment: ISegment, startOffset: number, endOffset: number) => boolean;
export declare class SourceDocument extends PrimedComponent {
    private get sharedString();
    get length(): number;
    private maybeSharedString?;
    constructor(runtime: IComponentRuntime, context: IComponentContext);
    getSegmentAndOffset(position: number): Readonly<{
        segment: any;
        offset: number;
    }>;
    getPosition(segment: ISegment): number;
    addLocalRef(position: number): LocalReference;
    removeLocalRef(localRef: LocalReference): void;
    localRefToPosition(localRef: LocalReference): number;
    insertText(position: number, text: string): void;
    replaceWithText(start: number, end: number, text: string): void;
    remove(start: number, end: number): void;
    visitRange(callback: LeafAction, start?: number, end?: number): void;
    on(event: "maintenance", listener: (event: SequenceMaintenanceEvent, target: SharedString, ...args: any[]) => void): this;
    on(event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: SharedString, ...args: any[]) => void): this;
    off(event: "maintenance", listener: (event: SequenceMaintenanceEvent, target: SharedString, ...args: any[]) => void): this;
    off(event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: SharedString, ...args: any[]) => void): this;
    getPreviousSegment(current: ISegment): any;
    annotate(start: number, end: number, props: PropertySet): void;
    annotateLocal(start: number, end: number, props: PropertySet): void;
    protected componentInitializingFirstTime(): Promise<void>;
    protected componentHasInitialized(): Promise<void>;
    private ensureIntervalBoundary;
}
export {};
//# sourceMappingURL=document.d.ts.map