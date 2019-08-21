/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext, IComponentSerializer } from "@prague/component-core-interfaces";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { ISharedObject, SharedObject, ValueType } from "@prague/shared-object-common";
import { ISerializableValue, IValueOpEmitter, IValueOperation, IValueType } from "./interfaces";

export interface ILocalValue {
    readonly type: string;
    readonly value: any;
    makeSerializable(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle): ISerializableValue;
}

export class PlainLocalValue implements ILocalValue {
    constructor(public readonly value: any) {
    }

    public get type(): string {
        return ValueType[ValueType.Plain];
    }

    public makeSerializable(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ): ISerializableValue {
        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const result = this.value !== undefined ?
            serializer.stringify(
                this.value,
                context,
                bind,
            ) :
            undefined;
        const value = result !== undefined ? JSON.parse(result) : undefined;

        return {
            type: this.type,
            value,
        };
    }
}

export class SharedLocalValue implements ILocalValue {
    constructor(public readonly value: ISharedObject) {
    }

    public get type(): string {
        return ValueType[ValueType.Shared];
    }

    public makeSerializable(): ISerializableValue {
        return {
            type: this.type,
            value: this.value.id,
        };
    }
}

// TODO: Should maybe be a generic
export class ValueTypeLocalValue implements ILocalValue {
    constructor(public readonly value: any, private readonly valueType: IValueType<any>) {
    }

    public get type(): string {
        return this.valueType.name;
    }

    public makeSerializable(): ISerializableValue {
        return {
            type: this.type,
            value: this.valueType.factory.store(this.value),
        };
    }

    public getOpHandler(opName: string): IValueOperation<any> {
        const handler = this.valueType.ops.get(opName);
        if (!handler) {
            throw new Error("Unknown type message");
        }

        return handler;
    }
}

export class LocalValueMaker {
    private readonly valueTypes = new Map<string, IValueType<any>>();

    constructor(private readonly runtime: IComponentRuntime, private readonly containingObject: ISharedObject) {
    }

    public registerValueType<T>(type: IValueType<T>) {
        this.valueTypes.set(type.name, type);
    }

    public hasValueType(type: string): boolean {
        return this.valueTypes.has(type);
    }

    public async fromSerializable(serializable: ISerializableValue, emitter?: IValueOpEmitter) {
        if (serializable.type === ValueType[ValueType.Shared]) {
            // even though this is getting an IChannel, we trust it will be a SharedObject because of the type marking
            const localValue = await this.runtime.getChannel(serializable.value as string) as ISharedObject;
            return new SharedLocalValue(localValue);
        } else if (serializable.type === ValueType[ValueType.Plain]) {
            // stored value comes in already parsed so we stringify again to run through converter
            const translatedValue = serializable.value !== undefined ?
                this.runtime.IComponentSerializer.parse(
                        JSON.stringify(serializable.value),
                        this.runtime.IComponentHandleContext,
                    ) :
                undefined;
            return new PlainLocalValue(translatedValue);
        } else if (this.valueTypes.has(serializable.type)) {
            const valueType = this.valueTypes.get(serializable.type);
            const localValue = valueType.factory.load(emitter, serializable.value);
            return new ValueTypeLocalValue(localValue, valueType);
        } else {
            return Promise.reject(`Unknown value type "${serializable.type}"`);
        }
    }

    public fromInMemory(value: any) {
        if (SharedObject.is(value)) {
            // Shared objects need to be registered before we set them, so other clients will know what to do when
            // they are referenced in incoming ops.  Don't do this unless the containing object is registered though.
            // If the containing object is registered at a later point in time, it must register all contained objects
            // in its registerCore.
            if (this.containingObject.isRegistered()) {
                value.register();
            }
            return new SharedLocalValue(value);
        } else {
            return new PlainLocalValue(value);
        }
    }

    public makeValueType(type: string, emitter: IValueOpEmitter, params: any) {
        // params is the initialization information for the value type, e.g. initial count on a counter
        // type is the value type Name to initialize, e.g. "counter"
        const valueType = this.loadValueType(params, type, emitter);
        return new ValueTypeLocalValue(valueType, this.valueTypes.get(type));
    }

    private loadValueType(value: any, type: string, emitter: IValueOpEmitter) {
        const valueType = this.valueTypes.get(type);
        if (!valueType) {
            throw new Error(`Unknown type '${type}' specified`);
        }

        return valueType.factory.load(emitter, value);
    }
}
