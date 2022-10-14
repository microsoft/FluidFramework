import { DataBinder } from "@fluid-experimental/property-binder";
import { MapProperty, NamedNodeProperty, NamedProperty, NodeProperty, PropertyFactory } from "@fluid-experimental/property-properties";
import leaf from "./leaf-1.0.0";
import branch from "./branch-1.0.0";
import { LeafBinding } from "./leafBinding";
import { LeafController } from "./leafController";
import { createSimpleWorkspace, registerSchema, SimpleWorkspace } from "./workspace";
import { DeleteCallback, SharedPropertyMap, UpdateCallback } from "./interfaces";
import { SharedPropertyTree } from "@fluid-experimental/property-dds";

export const MAIN: string = "main";

export interface Leaf {
    key: string;
    payload: string;
}

export interface Branch {
    name: string;
}

export async function initMap(
    mapId: string | undefined,
    leafAdd: UpdateCallback,
    leafUpdate: UpdateCallback,
    leafRemove: DeleteCallback,
    treeClass: any = SharedPropertyTree,
    registerSchemaFlag: boolean = true
): Promise<SharedPropertyMap> {

    const workspace = await initWorkspace(mapId, treeClass, leafAdd, leafUpdate, leafRemove, registerSchemaFlag);

    return {
        delete: (key: string) => removeLeaf(key, workspace),
        forEach: (callbackfn: (value: string, key: string) => void) => getLeaves(workspace).map(leaf => callbackfn(leaf.payload, leaf.key)),
        get: (key: string) => getLeaf(key, workspace).payload,
        has: (key: string) => getLeaf(key, workspace) !== undefined,
        set: (key: string, value: string) => { updateLeaf(key, value, workspace); return this; },
        keys: () => getKeys(workspace),
        values: () => getLeaves(workspace).map(leaf => leaf.payload),
        commit: () => workspace.commit(),
        dispose: () => workspace.dispose(),
        insert: (key: string, value: string) => { createLeaf(key, value, workspace); return this; },
        insertMany: (map: Map<string, string>) => { createLeaves(map, workspace); return this; },
        updateMany: (map: Map<string, string>) => { updateLeaves(map, workspace); return this; },
        deleteMany: (keys: string[]) => removeLeaves(keys, workspace),
        mapId: () => workspace.containerId
    }
}

export async function initWorkspace(
    containerId: string,
    treeClass: any,
    leafAdd: (name: string, payload: string) => void,
    leafUpdate: (name: string, payload: string) => void,
    leafRemove: (name: string) => void,
    registerSchemaFlag: boolean = true
): Promise<SimpleWorkspace> {

    if (registerSchemaFlag) {
        registerSchema(branch);
        registerSchema(leaf);
    }

    const workspace = await createSimpleWorkspace(containerId, treeClass);
    configureBinding(workspace.dataBinder, leafAdd, leafUpdate, leafRemove);

    if (containerId === undefined) {
        createBranch(MAIN, workspace);
        workspace.commit();
    }

    return workspace;
}

export function configureBinding(
    fluidBinder: DataBinder,
    leafAdd: (name: string, payload: string) => void,
    leafUpdate: (name: string, payload: string) => void,
    leafRemove: (name: string) => void) {

    fluidBinder.defineRepresentation("test", "hex:branch-1.0.0", (property) => {
        return new LeafController(leafAdd, leafUpdate, leafRemove);
    });
    fluidBinder.defineDataBinding("test", "hex:branch-1.0.0", LeafBinding);
    fluidBinder.activateDataBinding("test");
}

export function getKeys(workspace: SimpleWorkspace): string[] {
    return retrieveBranchProperty(MAIN, workspace).getIds();
}

export function getLeaves(workspace: SimpleWorkspace): Leaf[] {
    const keys: string[] = getKeys(workspace);
    const leaves: { "key": string, "payload": string }[] = [];
    keys.map(key => {
        const leaf = getLeaf(key, workspace);
        if (leaf !== undefined)
            leaves.push(leaf);
    });
    return leaves;
}

export function getLeaf(key: string, workspace: SimpleWorkspace) {
    const leafProperty = retrieveBranchProperty(MAIN, workspace).get(key) as NamedProperty;
    if (leafProperty !== undefined) {
        const payload: string = leafProperty.getValue("payload");
        const leaf = { "key": key, "payload": payload };
        return leaf;
    } else return undefined;
}

export function removeLeaves(keys: string[], workspace: SimpleWorkspace) {
    keys.map(key => removeLeaf(key, workspace));
}

export function removeLeaf(key: string, workspace: SimpleWorkspace) {
    retrieveBranchProperty(MAIN, workspace).remove(key);
}

export function updateLeaves(payloads: Map<string, string>, workspace: SimpleWorkspace) {
    payloads.forEach((payload, key) => updateLeaf(key, payload, workspace));
}

export function updateLeaf(key: string, payload: string, workspace: SimpleWorkspace) {
    const leafProperty = retrieveBranchProperty(MAIN, workspace).get(key) as NamedProperty;
    if (leafProperty === undefined)
        createLeaf(key, payload, workspace);
    else
        leafProperty.setValues({"payload": payload});
}

export function createLeaves(payloads: Map<string, string>, workspace: SimpleWorkspace): Leaf[] {
    const leaves: { "key": string, "payload": string }[] = [];
    payloads.forEach((payload, key) => {
        const leaf: { "key": string, "payload": string } = createLeaf(key, payload, workspace);
        leaves.push(leaf);
    });
    return leaves;
}

export function createLeaf(key: string, payload: string, workspace: SimpleWorkspace): Leaf {
    const leafProperty: NamedProperty = PropertyFactory.create("hex:leaf-1.0.0", undefined, { "payload": payload });
    retrieveBranchProperty(MAIN, workspace).insert(key, leafProperty);
    return { "key": key, "payload": payload };
}

export function createBranch(name: string, workspace: SimpleWorkspace): Branch {
    const rootProp: NodeProperty = workspace.rootProperty;
    const branchProperty: NamedNodeProperty = PropertyFactory.create<NamedNodeProperty>("hex:branch-1.0.0");
    rootProp.insert(name, branchProperty);
    return { name }
}

export function retrieveBranchProperty(name: string, workspace: SimpleWorkspace): MapProperty {
    const branchProperty: MapProperty = workspace.rootProperty.resolvePath(`${name}.leaves`) as MapProperty
    return branchProperty;
}