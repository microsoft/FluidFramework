/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Packages } from "../npmPackage";
import * as path from "path";

interface ILayerInfo {
    deps?: string[];
    packages?: string[];
    dirs?: string[];
    test?: boolean;
};

interface ILayerInfoFile {
    [key: string]: { [key: string]: ILayerInfo }
};

class BaseLayerNode {
    private dependentSet = new Set<BaseLayerNode>();
    constructor(public readonly name: string) { }

    public addDependent(dep: BaseLayerNode) {
        this.dependentSet.add(dep);
    }

    public get dependents() {
        return this.dependentSet.values();
    }

    public verifyDependent(dep: PackageLayerNode) {
        //console.log(`${this.name} -> ${dep.name}`);
        if (this.dependentSet.has(dep)) {
            return true;
        }

        for (const node of this.dependents) {
            if (node.verifyDependent(dep)) {
                return true;
            }
        }
        return false;
    }
};

class TopLayerNode extends BaseLayerNode {
    constructor(name: string, public readonly test: boolean = false) {
        super(name);
    }
};

class LayerItemNode extends BaseLayerNode {
    constructor(name: string, public readonly topLayerNode: TopLayerNode) {
        super(name);
    }

    public get topLayerName() {
        return this.topLayerNode.name;
    }

    public get isTest() {
        return this.topLayerNode.test;
    }
};

class PackageLayerNode extends LayerItemNode {
    constructor(name: string, layerNode: TopLayerNode) {
        super(name, layerNode);
    }
};

class DirLayerNode extends LayerItemNode {
    private packages = new Set<PackageLayerNode>();
    public addPackage(pkg: PackageLayerNode) {
        this.packages.add(pkg);
    }

    public verifyDependent(dep: PackageLayerNode) {
        if (this.packages.has(dep)) { return true; }
        return super.verifyDependent(dep);
    }
}


export class LayerGraph {
    private layers = new Map<string, TopLayerNode>();
    private packageLayer = new Map<string, PackageLayerNode>();
    private dirLayers: { [key: string]: DirLayerNode } = {};

    private createPackage(name: string, layer: TopLayerNode) {
        if (this.packageLayer.get(name)) {
            throw new Error(`Duplicate package layer entry ${name}`);
        }
        const packageLayerNode = new PackageLayerNode(name, layer);
        this.packageLayer.set(name, packageLayerNode);
        return packageLayerNode;
    }
    private constructor(root: string, layerInfo: ILayerInfoFile) {
        // Load the layer info
        const pendingDeps: { node: BaseLayerNode, deps: string[] | undefined }[] = [];

        // First pass get the layer nodes
        for (const layerGroup of Object.keys(layerInfo)) {
            const layerGroupInfo = layerInfo[layerGroup];
            for (const layer of Object.keys(layerGroupInfo)) {
                const info = layerGroupInfo[layer];
                const layerNode = new TopLayerNode(layer, info.test)
                this.layers.set(layer, layerNode);
                if (info.dirs) {
                    for (const dir of info.dirs) {
                        const fullDir = path.resolve(root, dir);
                        const dirLayerNode = new DirLayerNode(fullDir, layerNode);
                        this.dirLayers[fullDir] = dirLayerNode;
                        layerNode.addDependent(dirLayerNode);
                        pendingDeps.push({ node: dirLayerNode, deps: info.deps });
                    }
                }
                if (info.packages) {
                    for (const pkg of info.packages) {
                        const packageLayerNode = this.createPackage(pkg, layerNode);
                        layerNode.addDependent(packageLayerNode);
                        pendingDeps.push({ node: packageLayerNode, deps: info.deps });
                    }
                }
            }
        }

        // Wire up the dependents
        for (const { node, deps } of pendingDeps) {
            if (!deps) { continue; }
            for (const dep of deps) {
                const depLayer = this.layers.get(dep);
                if (depLayer) {
                    node.addDependent(depLayer);
                } else {
                    const depPackage = this.packageLayer.get(dep);
                    if (depPackage === undefined) {
                        throw new Error(`Missing package entry for dependency ${dep} in ${node.name}`);
                    }
                    node.addDependent(depPackage);
                }
            }
        }
    }

    private verify(packages: Packages) {
        // Match the packages to the node if it is not explicitly specified
        for (const pkg of packages.packages) {
            if (this.packageLayer.get(pkg.name)) { continue; }
            for (const dir of Object.keys(this.dirLayers)) {
                if (pkg.directory.startsWith(dir)) {
                    //console.log(`${pkg.nameColored}: ${dir}`);
                    const dirLayerNode = this.dirLayers[dir];
                    const packageLayerNode = this.createPackage(pkg.name, dirLayerNode.topLayerNode);
                    dirLayerNode.addPackage(packageLayerNode);
                    for (const dep of dirLayerNode.dependents) {
                        packageLayerNode.addDependent(dep);
                    }
                    break;
                }
            }
        }

        let error = false;
        // Go thru the packages and check for dependency violation
        for (const pkg of packages.packages) {
            const packageLayerNode = this.packageLayer.get(pkg.name);
            if (!packageLayerNode) {
                console.error(`${pkg.nameColored}: error: Package doesn't match any directories. Unable to do dependency check`);
                error = true;
                continue;
            }
            if (packageLayerNode.isTest) {
                // Don't check dependency on test packages
                continue;
            }
            for (const dep of pkg.dependencies) {
                const depLayerNode = this.packageLayer.get(dep);
                if (!depLayerNode) { continue; }
                if (depLayerNode.isTest) {
                    console.error(`${pkg.nameColored}: error: test packages appearing in package dependencies instead of devDependencies - ${dep}, `);
                    error = true;
                }
                // Package can depend on each other if they are in the same layer
                if (packageLayerNode.topLayerNode === depLayerNode.topLayerNode) { continue; }
                //console.log(`${pkg.nameColored}: checking ${dep}`);
                if (!packageLayerNode.verifyDependent(depLayerNode)) {
                    console.error(`${pkg.nameColored}: error: Dependency layer violation ${dep}, "${packageLayerNode.topLayerName}" -> "${depLayerNode.topLayerName}"`);
                    error = true;
                }
            }
        }
        return error;
    }

    public static check(root: string, packages: Packages) {
        const layerInfoFile = require(path.join(__dirname, "..", "..", "data", "layerInfo.json"));
        const layerGraph = new LayerGraph(root, layerInfoFile);
        return layerGraph.verify(packages);
    }
};