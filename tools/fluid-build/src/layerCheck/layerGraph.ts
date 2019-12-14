/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, Packages } from "../npmPackage";
import { logVerbose } from "../common/logging";
import * as path from "path";

interface ILayerInfo {
    deps?: string[];
    packages?: string[];
    dirs?: string[];
    test?: boolean;
    dot?: boolean;
};

interface ILayerInfoFile {
    [key: string]: { [key: string]: ILayerInfo }
};

class BaseNode {
    constructor (public readonly name: string) {}

    public get dotName() {
        return this.name.replace("-", "_").toLowerCase();
    }
};

class LayerNode extends BaseNode{
    private packages = new Set<PackageNode>();
    private dependentPackageNodes = new Set<PackageNode>();
    private dependentLayerNodes: LayerNode[] = [];

    constructor(name: string, public readonly layerInfo: ILayerInfo) {
        super(name);
    }

    public get doDot() {
        return this.layerInfo.dot !== false && !this.isTest;
    }
    public get isTest() {
        return this.layerInfo.test === true;
    }

    public addPackage(packageNode: PackageNode) {
        this.packages.add(packageNode);
    }

    public addDependentPackageNode(dep: PackageNode) {
        this.dependentPackageNodes.add(dep);
    }

    public addDependentLayerNode(dep: LayerNode) {
        this.dependentLayerNodes.push(dep);
    }

    public generateDotSubgraph() {
        if (!this.doDot) { return ""; }
        return `
    subgraph cluster_${this.dotName} {
      ${Array.from(this.packages.values(), packageNode => `"${packageNode.dotName}"`).join("\n      ")}
    }`
    }

    public verifyDependent(dep: PackageNode) {
        if (this.packages.has(dep)) {
            logVerbose(`Found: ${dep.name} in ${this.name}`);
            return true;
        }
        if (this.dependentPackageNodes.has(dep)) {
            logVerbose(`Found: ${dep.name} in ${this.name}`);
            return true;
        }

        for (const node of this.dependentLayerNodes) {
            logVerbose(`Traversing: ${this.name} -> ${node.name}`);
            if (node.verifyDependent(dep)) {
                return true;
            }
        }
        return false;
    }
};


class GroupNode extends BaseNode {
    public layerNodes: LayerNode[] = [];

    constructor(name: string) {
        super(name);
    }

    public createTopLayerNode(name: string, layerInfo: ILayerInfo) {
        const topLayerNode = new LayerNode(name, layerInfo);
        this.layerNodes.push(topLayerNode);
        return topLayerNode;
    }

    public generateDotSubgraph() {
        return `
  subgraph cluster_group_${this.dotName} { ${this.layerNodes.map(topLayerNode => topLayerNode.generateDotSubgraph()).join("")}
  }`;
    }
};

class PackageNode extends BaseNode {
    constructor(name: string, private readonly topLayerNode: LayerNode) {
        super(name);
    }

    public get layerName() {
        return this.topLayerNode.name;
    }

    public get isTest() {
        return this.topLayerNode.isTest;
    }

    public get doDot() {
        return this.topLayerNode.doDot;
    }

    public verifyDependent(dep: PackageNode) {
        return this.topLayerNode.verifyDependent(dep);
    }

    public get dotName() {
        return this.name.replace(/@microsoft\/fluid\-/, "");
    }
};

export class LayerGraph {
    private groupNodes: GroupNode[] = [];
    private layerNodeMap = new Map<string, LayerNode>();
    private packageNodeMap = new Map<string, PackageNode>();
    private dirMapping: { [key: string]: LayerNode } = {};

    private createPackage(name: string, layer: LayerNode) {
        if (this.packageNodeMap.get(name)) {
            throw new Error(`Duplicate package layer entry ${name}`);
        }
        const packageNode = new PackageNode(name, layer);
        this.packageNodeMap.set(name, packageNode);
        layer.addPackage(packageNode);
    }
    private constructor(root: string, layerInfo: ILayerInfoFile, private readonly packages: Packages) {
        // First pass get the layer nodes
        for (const groupName of Object.keys(layerInfo)) {

            const groupInfo = layerInfo[groupName];
            const groupNode = new GroupNode(groupName);
            this.groupNodes.push(groupNode);

            for (const layerName of Object.keys(groupInfo)) {

                const layerInfo = groupInfo[layerName];
                const layerNode = groupNode.createTopLayerNode(layerName, layerInfo);
                this.layerNodeMap.set(layerName, layerNode);

                if (layerInfo.dirs) {
                    layerInfo.dirs.forEach(dir => this.dirMapping[path.resolve(root, dir)] = layerNode);
                }
                if (layerInfo.packages) {
                    layerInfo.packages.forEach(pkg => this.createPackage(pkg, layerNode));
                }
            }
        }

        // Wire up the dependents
        for (const groupNode of this.groupNodes) {
            for (const layerNode of groupNode.layerNodes) {
                if (!layerNode.layerInfo.deps) { continue; }
                for (const depName of layerNode.layerInfo.deps) {
                    const depLayer = this.layerNodeMap.get(depName);
                    if (depLayer) {
                        layerNode.addDependentLayerNode(depLayer);
                    } else {
                        const depPackage = this.packageNodeMap.get(depName);
                        if (depPackage === undefined) {
                            throw new Error(`Missing package entry for dependency ${depName} in ${layerNode.name}`);
                        }
                        layerNode.addDependentPackageNode(depPackage);
                    }
                }
            }
        }

        // Match the packages to the node if it is not explicitly specified
        for (const pkg of packages.packages) {
            if (this.packageNodeMap.get(pkg.name)) { continue; }
            for (const dir of Object.keys(this.dirMapping)) {
                if (pkg.directory.startsWith(dir)) {
                    const layerNode = this.dirMapping[dir];
                    logVerbose(`${pkg.nameColored}: matched with ${layerNode.name} (${dir})`);
                    this.createPackage(pkg.name, layerNode);
                    break;
                }
            }
        }
    }

    private forEachDependencies(exec: (pkg: Package, src: PackageNode, dest: PackageNode) => boolean) {
        let success = true;
        // Go thru the packages and check for dependency violation
        for (const pkg of this.packages.packages) {
            const packageNode = this.packageNodeMap.get(pkg.name);
            if (!packageNode) {
                console.error(`${pkg.nameColored}: error: Package doesn't match any directories. Unable to do dependency check`);
                success = false;
                continue;
            }
            if (packageNode.isTest) {
                // Don't check dependency on test packages
                continue;
            }
            for (const dep of pkg.dependencies) {
                const depPackageNode = this.packageNodeMap.get(dep);
                if (!depPackageNode) { continue; }

                if (exec(pkg, packageNode, depPackageNode)) { 
                    success = false;
                }
            }
        }
        return success;
    }
    public verify() {
        return this.forEachDependencies((pkg, packageNode, depPackageNode) => {
            let success = true;
            if (depPackageNode.isTest) {
                console.error(`${pkg.nameColored}: error: test packages appearing in package dependencies instead of devDependencies - ${depPackageNode.name}, `);
                success = false;
            }

            logVerbose(`${pkg.nameColored}: checking ${depPackageNode.name} from ${packageNode.layerName}`);
            if (!packageNode.verifyDependent(depPackageNode)) {
                console.error(`${pkg.nameColored}: error: Dependency layer violation ${depPackageNode.name}, "${packageNode.layerName}" -> "${depPackageNode.layerName}"`);
                success = false;
            }
            return success;
        });
    }

    public generateDotEdges() {
        const entries: string[] = [];
        this.forEachDependencies((pkg, packageNode, depPackageNode) => {
            if (packageNode.doDot) {
                entries.push(`"${packageNode.dotName}"->"${depPackageNode.dotName}"`);
            }
            return true;
        });
        return entries.join("\n  ");
    }
    public generateDotGraph() {
        return `strict digraph G { ${this.groupNodes.map(group => group.generateDotSubgraph()).join("")}
  ${this.generateDotEdges()}
}`;
    }

    public static load(root: string, packages: Packages) {
        const layerInfoFile = require(path.join(__dirname, "..", "..", "data", "layerInfo.json"));
        return new LayerGraph(root, layerInfoFile, packages);
    }
};