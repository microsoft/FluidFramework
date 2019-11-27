import { Packages } from "./npmPackage";
import * as path from "path";

interface ILayerInfo {
    deps?: string[];
    packages?: string[];
    dirs?: string[];
};

interface ILayerInfoFile {
    [key: string]: ILayerInfo;
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
};

class LayerItemNode extends BaseLayerNode {
    constructor(name: string, public readonly topLayerNode: TopLayerNode) {
        super(name);
    }

    public get topLayerName() {
        return this.topLayerNode.name;
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
        const pendingDeps: { node: BaseLayerNode, deps: string[] | undefined }[] = [];

        // First pass get the layer nodes
        for (const layer of Object.keys(layerInfo)) {
            const layerNode = new TopLayerNode(layer)
            this.layers.set(layer, layerNode);
            const info = layerInfo[layer];
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

        for (const pkg of packages.packages) {
            const packageLayerNode = this.packageLayer.get(pkg.name);
            if (!packageLayerNode) {
                console.warn(`${pkg.nameColored}: warning: Package doesn't match any directories. Unable to do dependency check`);
                continue;
            }
            for (const dep of pkg.dependencies) {
                const depLayerNode = this.packageLayer.get(dep);
                if (!depLayerNode) { continue; }
                // Package can depend on each other if they are in the same layer
                if (packageLayerNode.topLayerNode === depLayerNode.topLayerNode) { continue; }
                //console.log(`${pkg.nameColored}: checking ${dep}`);
                if (!packageLayerNode.verifyDependent(depLayerNode)) {
                    console.warn(`${pkg.nameColored}: warning: Dependency layer violation ${dep}, "${packageLayerNode.topLayerName}" -> "${depLayerNode.topLayerName}"`);
                }
            }
        }
    }

    public static check(root: string, packages: Packages) {
        const layerInfoFile = require("../data/layerInfo.json");
        const layerGraph = new LayerGraph(root, layerInfoFile);
        layerGraph.verify(packages);
    }
};