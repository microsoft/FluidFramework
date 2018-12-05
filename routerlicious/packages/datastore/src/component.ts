import {
    ICollaborativeObjectExtension,
} from "@prague/api-definitions";
import { IMap, MapExtension } from "@prague/map";
import { IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { debug } from "./debug";

// Base class for chainloadable components
export abstract class Component extends EventEmitter implements IPlatform {
    private static readonly rootMapId = "root";

    public readonly collaborativeTypes: ReadonlyMap<string, ICollaborativeObjectExtension>;

    public get runtime(): IRuntime {
        return this._runtime;
    }

    public get platform(): IPlatform {
        return this._platform;
    }

    public get root(): IMap {
        return this._root;
    }

    public get id(): string {
        return this.runtime.id;
    }

    public get existing(): boolean {
        return this.runtime.existing;
    }

    // tslint:disable:variable-name
    private _runtime: IRuntime = null;
    private _platform: IPlatform = null;
    private _root: IMap = null;
    // tslint:enable:variable-name

    constructor(types: ReadonlyArray<[string, ICollaborativeObjectExtension]>) {
        super();

        // Add in the map if not already specified
        const collaborativeTypes = new Map<string, ICollaborativeObjectExtension>(types);
        if (!collaborativeTypes.has(MapExtension.Type)) {
            collaborativeTypes.set(MapExtension.Type, new MapExtension());
        }
        this.collaborativeTypes = collaborativeTypes;
    }

    public async open(runtime: IRuntime, platform: IPlatform): Promise<void> {
        this._runtime = runtime;
        this._platform = platform;

        if (runtime.existing) {
            debug("Component.open(existing)");
            this._root = await runtime.getChannel(Component.rootMapId) as IMap;
        } else {
            debug("Component.open(new)");
            this._root = runtime.createChannel(Component.rootMapId, MapExtension.Type) as IMap;
            this.root.attach();
            await this.create();
        }

        debug("Component.opened");
        await this.opened();
    }

    /**
     * Retrieves the root collaborative object that the document is based on
     */
    public getRoot(): IMap {
        return this.root;
    }

    /**
     * Subclass implements 'opened()' to finish initialization after the component has been opened/created.
     */
    public abstract async opened(): Promise<void>;

    public queryInterface<T>(id: string): Promise<T> {
        return Promise.resolve(null);
    }

    /**
     * Subclass implements 'create()' to put initial document structure in place.
     */
    protected abstract create(): Promise<void>;
}
