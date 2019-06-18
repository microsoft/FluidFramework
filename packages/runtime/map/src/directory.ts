/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:align

import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { ParsedPath, posix as pathutil } from "path";
import { IMapOperation } from "./definitions";
import { MapExtension } from "./extension";
import { ISharedDirectory, IValueChanged } from "./interfaces";
import { SharedMap } from "./map";
import { DirectoryView, ILocalViewElement } from "./view";

export class SharedDirectory extends SharedMap implements ISharedDirectory {
    public static pathSeparator = "/";
    public subdirectory: ViewSubDirectory;
    /**
     * Constructs a new shared directory. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
        type = MapExtension.Type) {

        super(id, runtime, type);
        this.subdirectory = new ViewSubDirectory(this.view as DirectoryView);
    }

    public setPath<T = any>(path: string, value: T, type?: string): void {
        const values = this.view.prepareOperationValue(path, value, type);

        const op: IMapOperation = {
            key: path,
            type: "setPath",
            value: values.operationValue,
        };

        this.setPathCore(
            op.key,
            {
                localType: values.operationValue.type,
                localValue: values.localValue,
            },
            true,
            null);
        this.submitMapKeyMessage(op);
    }

    public pathToSubdir(path: string) {
        let relPath = path;
        if (pathutil.isAbsolute(path)) {
            relPath = path.substring(1);
        }
        const parsedPath = pathutil.parse(relPath);
        let subdir: SubDirectory = this.subdirectory;
        if (parsedPath.dir.length > 0) {
            const dirNames = parsedPath.dir.split(SharedDirectory.pathSeparator);
            for (const dirName of dirNames) {
                let childDir: SubDirectory;
                if (!subdir.hasKey(dirName)) {
                    return undefined;
                } else {
                    const anyValue = subdir.getKey(dirName);
                    if (anyValue instanceof SubDirectory) {
                        childDir = anyValue;
                    } else {
                        return undefined;
                    }
                }
                subdir = childDir;
            }
        }
        return subdir;
    }

    public hasPath<T = any>(path: string): boolean {
        return this.getPath(path) !== undefined;
    }

    public getPath<T = any>(path: string): T {
        const subdir = this.pathToSubdir(path);
        if (subdir) {
            return subdir.getKey<T>(pathutil.basename(path));
        }
    }

    public async waitPath<T>(path: string): Promise<T> {
        if (this.hasPath(path)) {
            return this.getPath(path);
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve, reject) => {
            const callback = (value: IValueChanged) => {
                if (path === value.key) {
                    resolve(this.getPath(value.key));
                    this.removeListener("valueChanged", callback);
                }
            };

            this.on("valueChanged", callback);
        });
    }

    public setPathCore<T = any>(path: string, value: T, local: boolean,
        op: ISequencedDocumentMessage) {
        let relPath = path;
        if (pathutil.isAbsolute(path)) {
            relPath = path.substring(1);
        }
        const parsedPath = pathutil.parse(relPath);
        const subdir = this.ensureSubDirectories(parsedPath);
        const previousValue = subdir.getKey(parsedPath.name);
        subdir.setKey(parsedPath.name, value);
        const event: IValueChanged = { key: path, previousValue };
        this.emit("valueChanged", event, local, op);
    }

    public ensureSubDirectories(parsedPath: ParsedPath) {
        let absolutePath = "/";
        let subdir: SubDirectory = this.subdirectory;
        if (parsedPath.dir.length > 0) {
            const dirNames = parsedPath.dir.split(SharedDirectory.pathSeparator);
            for (const dirName of dirNames) {
                let childDir: SubDirectory;
                if (!subdir.hasKey(dirName)) {
                    childDir = new SubDirectory(this, absolutePath);
                } else {
                    childDir = subdir.getKey(dirName);
                }
                subdir = childDir;
                absolutePath += (dirName + SharedDirectory.pathSeparator);
            }
        }
        return subdir;
    }

    protected initializeView() {
        this.view = new DirectoryView(
            this,
            this.runtime,
            this.id);
    }

    protected setMessageHandlers() {
        // tslint:disable:no-backbone-get-set-outside-model
        this.messageHandler.set(
            "setPath",
            {
                prepare: (op, local) => {
                    return local ? Promise.resolve(null) : this.view.prepareSetCore(op.key, op.value);
                },
                process: (op, context: ILocalViewElement, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    this.setPathCore(op.key, context, local, message);
                },
                submit: (op) => {
                    this.submitMapKeyMessage(op);
                },
            });

    }

    // TODO: block ISharedMap methods such as get, set, clear by overriding them and raising an
    // exception (these are not in ISharedDirectory and so not visible in the public API)
}

export class SubDirectory implements ISharedDirectory {
    private readonly data = new Map<string, any>();
    constructor(private readonly directory: SharedDirectory, public absolutePath: string) {
    }
    public hasKey(key: string) {
        return this.data.has(key);
    }

    public getKey<T = any>(key: string): T {
        return this.data.get(key) as T;
    }

    public setKey<T = any>(key: string, value: T) {
        this.data.set(key, value);
    }

    public hasPath(path: string): boolean {
        return this.directory.hasPath(this.buildPath(path));
    }

    public getPath<T = any>(path: string): T {
        return this.directory.getPath(this.buildPath(path));
    }

    public setPath<T = any>(path: string, value: T, type?: string): void {
        this.directory.setPath(this.buildPath(path), value, type);
    }

    public async waitPath<T>(path: string): Promise<T> {
        return this.directory.waitPath(this.buildPath(path));
    }

    private buildPath(path: string) {
        return pathutil.resolve(this.absolutePath, path);
    }
}

export class ViewSubDirectory extends SubDirectory {
    constructor(private readonly view: DirectoryView) {
        super(view.getMap() as SharedDirectory, "/");
    }
    public hasKey(key: string) {
        return this.view.has(key);
    }
    public getKey(key: string) {
        return this.view.get(key);
    }
    public setKey<T = any>(key: string, value: T) {
        this.view.set(key, value);
    }
}
