// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { assert } from "@fluidframework/common-utils";
// import { ITreeSubscriptionCursor, TreeNavigationResult } from "../../forest";
// import {
//     NamedTreeSchema,
//     TreeSchemaIdentifier,
//     lookupTreeSchema,
//     FieldSchema,
// } from "../../schema-stored";
// import { Anchor, UpPath } from "../../tree";
// import {
//     EditableTree,
//     EditableTreeOrPrimitive,
//     getTypeSymbol,
//     inProxyOrUnwrap,
//     ProxyTarget,
//     proxyTargetSymbol,
// } from "./editableTree";
// import { ProxyContext } from "./editableTreeContext";
// import { AdaptingProxyHandler, getArrayOwnKeys, keyIsValidIndex } from "./utilities";

// /**
//  * Unwrapped sequence field.
//  *
//  * Limited support of unwrapped sequences, implicit or explicit under a primary key:
//  * - set value using assignment by index
//  * - append to the tail using `push()` or assignment by index equals length. This is limited to single-type sequences
//  * - append to the tail using `appendNodeSymbol`
//  */
// export type UnwrappedEditableSequence = readonly EditableTreeOrPrimitive[] & {
//     /**
//      * A function to get the type of a node.
//      * If this node is well-formed, it must follow this schema.
//      * @param index - if index is supplied, returns the type of a non-sequence child node (if exists)
//      * @param nameOnly - if true, returns only the type identifier
//      */
//     readonly [getTypeSymbol]: (
//         index?: number,
//         nameOnly?: boolean,
//     ) => NamedTreeSchema | TreeSchemaIdentifier | undefined;

//     /**
//      * Stores the target for the proxy which implements reading and writing for this sequence field.
//      * The details of this object are implementation details,
//      * but the presence of this symbol can be used to separate EditableTrees from other types.
//      */
//     readonly [proxyTargetSymbol]: object;
// };

// export type EditableSequence = readonly EditableTree[];

// /**
//  * A Proxy target, which together with a {@link sequenceHandler} implements a basic read/write access to
//  * the sequence fields by means of the cursors.
//  */
// export class ProxyTargetSequence<T extends EditableTreeOrPrimitive = EditableTreeOrPrimitive> implements Array<T> {
//     // A delegate to avoid code duplicates for cursors, anchors, etc.
//     private readonly targetDelegate: ProxyTarget;
//     private offset: number = 0;

//     constructor(
//         context: ProxyContext,
//         fieldSchema: FieldSchema,
//         fieldCursor?: ITreeSubscriptionCursor,
//     ) {
//         this.targetDelegate = new ProxyTarget(context, fieldSchema, fieldCursor);
//         // Hide and preserve properties, otherwise they'll be listed by `Object.keys()`.
//         const privateProperties: PropertyKey[] = ["length", "targetDelegate"];
//         for (const propertyKey of privateProperties) {
//             Object.defineProperty(this, propertyKey, {
//                 enumerable: false,
//                 writable: false,
//                 configurable: false,
//                 value: Reflect.get(this, propertyKey),
//             });
//         }
//     }

//     [index: number]: T;

//     public get context(): ProxyContext {
//         return this.targetDelegate.context;
//     }

//     public getAnchor(): Anchor {
//         return this.targetDelegate.getAnchor();
//     }

//     public free(): void {
//         this.targetDelegate.free();
//     }

//     public prepareForEdit(): void {
//         this.targetDelegate.prepareForEdit();
//     }

//     public getPath(): UpPath | undefined {
//         return this.targetDelegate.getPath();
//     }

//     public get length(): number {
//         return this.targetDelegate.isEmpty ? 0 : this.cursor.length();
//     }

//     get cursor(): ITreeSubscriptionCursor {
//         return this.targetDelegate.cursor;
//     }

//     public getType(
//         index?: number,
//         nameOnly = true,
//     ): TreeSchemaIdentifier | NamedTreeSchema | undefined {
//         let typeName: TreeSchemaIdentifier | undefined;
//         if (index === undefined) {
//             const path = this.getPath();
//             if (path?.parentField !== undefined && this.cursor.up() === TreeNavigationResult.Ok) {
//                 // Sequences are typed only by their primary field, if any.
//                 if (this.targetDelegate.getPrimaryArrayKey() !== undefined) {
//                     typeName = this.cursor.type;
//                 }
//                 this.cursor.down(path.parentField, this.offset);
//             }
//         } else if (!this.targetDelegate.isEmpty) {
//             const offset = index - this.offset;
//             if (this.cursor.seek(offset) === TreeNavigationResult.Ok) {
//                 typeName = this.cursor.type;
//                 this.offset = index;
//             }
//         }
//         return typeName && !nameOnly
//             ? { name: typeName, ...lookupTreeSchema(this.context.forest.schema, typeName) }
//             : typeName;
//     }

//     public proxifyField(index: number): T {
//         const offset = index - this.offset;
//         const result = this.cursor.seek(offset);
//         assert(result === TreeNavigationResult.Ok, "Cannot navigate to the given index.");
//         this.offset = index;
//         return inProxyOrUnwrap(new ProxyTarget(this.context, this.fieldSchema, this.cursor)) as T;
//     }

//     public get fieldSchema(): FieldSchema {
//         return this.targetDelegate.fieldSchema;
//     }

//     /**
//      * Unwraps this sequence field into an array.
//      * Used in array methods where signatures require a complete array.
//      */
//     private get list(): T[] {
//         const list: T[] = [];
//         for (let i = 0; i < this.length; i++) {
//             list.push(this.proxifyField(i));
//         }
//         return list;
//     }

//     *[Symbol.iterator](): IterableIterator<T> {
//         const list = this.list;
//         for (const node of list) {
//             yield node;
//         }
//     }

//     forEach(
//         callbackfn: (
//             value: T,
//             index: number,
//             array: T[],
//         ) => void,
//         thisArg?: any,
//     ): void {
//         this.list.forEach(callbackfn, thisArg);
//     }

//     map<U>(
//         callbackfn: (
//             value: T,
//             index: number,
//             array: T[],
//         ) => U,
//         thisArg?: any,
//     ): U[] {
//         return this.list.map(callbackfn, thisArg);
//     }

//     every(
//         predicate: (
//             value: T,
//             index: number,
//             array: T[],
//         ) => unknown,
//         thisArg?: any,
//     ): boolean {
//         return this.list.every(predicate, thisArg);
//     }

//     some(
//         predicate: (
//             value: T,
//             index: number,
//             array: T[],
//         ) => unknown,
//         thisArg?: any,
//     ): boolean {
//         return this.list.some(predicate, thisArg);
//     }

//     filter(
//         predicate: (
//             value: T,
//             index: number,
//             array: T[],
//         ) => unknown,
//         thisArg?: any,
//     ): T[] {
//         return this.list.filter(predicate, thisArg);
//     }

//     reduce(
//         callbackfn: (
//             previousValue: T,
//             currentValue: T,
//             currentIndex: number,
//             array: T[],
//         ) => T,
//         initialValue?: T,
//     ): T;
//     reduce<U>(
//         callbackfn: (
//             previousValue: U,
//             currentValue: T,
//             currentIndex: number,
//             array: T[],
//         ) => U,
//         initialValue: U,
//     ): U {
//         return this.list.reduce(callbackfn, initialValue);
//     }

//     reduceRight(
//         callbackfn: (
//             previousValue: T,
//             currentValue: T,
//             currentIndex: number,
//             array: T[],
//         ) => T,
//         initialValue?: T,
//     ): T;
//     reduceRight<U>(
//         callbackfn: (
//             previousValue: U,
//             currentValue: T,
//             currentIndex: number,
//             array: T[],
//         ) => U,
//         initialValue: U,
//     ): U {
//         return this.list.reduceRight(callbackfn, initialValue);
//     }

//     find(
//         predicate: (
//             value: T,
//             index: number,
//             obj: T[],
//         ) => unknown,
//         thisArg?: any,
//     ): T | undefined {
//         return this.list.find(predicate, thisArg);
//     }

//     findIndex(
//         predicate: (
//             value: T,
//             index: number,
//             obj: T[],
//         ) => unknown,
//         thisArg?: any,
//     ): number {
//         return this.list.findIndex(predicate, thisArg);
//     }

//     pop(): T | undefined {
//         throw new Error("Method not implemented.");
//     }

//     push(...items: T[]): number {
//         throw new Error("Method not implemented.");
//     }

//     shift(): T | undefined {
//         throw new Error("Method not implemented.");
//     }

//     unshift(...items: T[]): number {
//         throw new Error("Method not implemented.");
//     }

//     toString(): string {
//         throw new Error("Method not implemented.");
//     }

//     toLocaleString(): string {
//         throw new Error("Method not implemented.");
//     }

//     concat(...items: ConcatArray<T>[]): T[];
//     concat(
//         ...items: (T | ConcatArray<T>)[]
//     ): T[] {
//         throw new Error("Method not implemented.");
//     }

//     join(separator?: string | undefined): string {
//         throw new Error("Method not implemented.");
//     }

//     reverse(): T[] {
//         throw new Error("Method not implemented.");
//     }

//     slice(start?: number | undefined, end?: number | undefined): T[] {
//         throw new Error("Method not implemented.");
//     }

//     sort(
//         compareFn?: ((a: T, b: T) => number) | undefined,
//     ): this {
//         throw new Error("Method not implemented.");
//     }

//     splice(start: number, deleteCount?: number | undefined): T[];
//     splice(
//         start: number,
//         deleteCount: number,
//         ...items: T[]
//     ): T[] {
//         throw new Error("Method not implemented.");
//     }

//     indexOf(searchElement: T, fromIndex?: number | undefined): number {
//         throw new Error("Method not implemented.");
//     }

//     lastIndexOf(searchElement: T, fromIndex?: number | undefined): number {
//         throw new Error("Method not implemented.");
//     }

//     fill(
//         value: T,
//         start?: number | undefined,
//         end?: number | undefined,
//     ): this {
//         throw new Error("Method not implemented.");
//     }

//     copyWithin(target: number, start: number, end?: number | undefined): this {
//         throw new Error("Method not implemented.");
//     }

//     entries(): IterableIterator<[number, T]> {
//         throw new Error("Method not implemented.");
//     }

//     keys(): IterableIterator<number> {
//         throw new Error("Method not implemented.");
//     }

//     values(): IterableIterator<T> {
//         throw new Error("Method not implemented.");
//     }

//     includes(searchElement: T, fromIndex?: number | undefined): boolean {
//         throw new Error("Method not implemented.");
//     }

//     [Symbol.unscopables](): {
//         at: boolean;
//         copyWithin: boolean;
//         entries: boolean;
//         fill: boolean;
//         find: boolean;
//         findIndex: boolean;
//         findLast: boolean;
//         findLastIndex: boolean;
//         flat: boolean;
//         flatMap: boolean;
//         includes: boolean;
//         keys: boolean;
//         values: boolean;
//     } {
//         return {
//             at: true,
//             copyWithin: true,
//             entries: true,
//             fill: true,
//             find: true,
//             findIndex: true,
//             findLast: true,
//             findLastIndex: true,
//             flat: true,
//             flatMap: true,
//             includes: true,
//             keys: true,
//             values: true,
//         };
//     }
// }

// /**
//  * A Proxy handler, which together with a {@link ProxyTargetSequence} implements a basic read/write access to
//  * the sequence fields by means of the cursors.
//  */
// export const sequenceHandler = <T extends UnwrappedEditableSequence = UnwrappedEditableSequence>(): AdaptingProxyHandler<ProxyTargetSequence<keyof T>, T> => {
//     return {
//         get: (target: ProxyTargetSequence, key: string | symbol, receiver: object): unknown => {
//             if (typeof key === "string") {
//                 const reflected = Reflect.get(target, key);
//                 if (typeof reflected === "function") {
//                     if (key === "constructor") {
//                         return [][key];
//                     }
//                     return function (...args: unknown[]): unknown {
//                         return Reflect.apply(reflected, target, args);
//                     };
//                 }
//                 const length = target.length;
//                 if (key === "length") {
//                     return length;
//                 } else if (keyIsValidIndex(key, length)) {
//                     return target.proxifyField(Number(key));
//                 }
//                 return undefined;
//             }
//             switch (key) {
//                 case getTypeSymbol:
//                     return target.getType.bind(target);
//                 case proxyTargetSymbol:
//                     return target;
//                 case Symbol.iterator:
//                     return target[Symbol.iterator].bind(target);
//                 default:
//             }
//             return undefined;
//         },
//         set: (
//             target: ProxyTargetSequence,
//             key: string,
//             value: unknown,
//             receiver: unknown,
//         ): boolean => {
//             throw new Error("Not implemented");
//         },
//         deleteProperty: (target: ProxyTargetSequence, key: string): boolean => {
//             throw new Error("Not supported");
//         },
//         // Include documented symbols and all non-empty fields.
//         has: (target: ProxyTargetSequence, key: string | symbol): boolean => {
//             if (typeof key === "symbol") {
//                 switch (key) {
//                     case Symbol.iterator:
//                     case proxyTargetSymbol:
//                     case getTypeSymbol:
//                         return true;
//                     default:
//                 }
//             } else {
//                 if (keyIsValidIndex(key, target.length)) {
//                     return true;
//                 }
//             }
//             return false;
//         },
//         ownKeys: (target: ProxyTargetSequence): ArrayLike<keyof (readonly EditableTree[])> => {
//             // This includes 'length' property.
//             const keys: string[] = getArrayOwnKeys(target.length);
//             // It is required by the proxy trap to list all target properties.
//             keys.push("targetDelegate");
//             return keys as ArrayLike<keyof (readonly EditableTree[])>;
//         },
//         getOwnPropertyDescriptor: (
//             target: ProxyTargetSequence,
//             key: string | symbol,
//         ): PropertyDescriptor | undefined => {
//             // We generally don't want to allow users of the proxy to reconfigure all the properties,
//             // but it is a TypeError to return non-configurable for properties that do not exist on target,
//             // so they must return true.
//             if (typeof key === "symbol") {
//                 switch (key) {
//                     case proxyTargetSymbol:
//                         return {
//                             configurable: true,
//                             enumerable: false,
//                             value: target,
//                             writable: false,
//                         };
//                     case getTypeSymbol:
//                         return {
//                             configurable: true,
//                             enumerable: false,
//                             value: target.getType.bind(target),
//                             writable: false,
//                         };
//                     default:
//                 }
//             } else {
//                 if (key === "length") {
//                     return {
//                         configurable: false,
//                         enumerable: false,
//                         value: target.length,
//                         writable: false,
//                     };
//                 } else if (key === "targetDelegate") {
//                     return {
//                         configurable: false,
//                         enumerable: false,
//                         value: Reflect.get(target, key),
//                         writable: false,
//                     };
//                 } else if (keyIsValidIndex(key, target.length)) {
//                     return {
//                         configurable: true,
//                         enumerable: true,
//                         value: target.proxifyField(Number(key)),
//                         writable: true,
//                     };
//                 }
//             }
//             return undefined;
//         },
//     };
// };
