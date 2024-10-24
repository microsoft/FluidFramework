/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import { EOL as newline } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Package } from "@fluidframework/build-tools";
import { readJsonSync } from "fs-extra/esm";

import registerDebug from "debug";
const traceLayerCheck = registerDebug("layer-check");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ILayerInfo {
	deps?: string[];
	packages?: string[];
	dirs?: string[];
	dev?: true;
	dot?: false;
	dotSameRank?: true;
}

interface ILayerGroupInfo {
	dot?: false;
	dotSameRank?: true;
	dotGroup?: false;
	layers: { [key: string]: ILayerInfo };
}

interface ILayerInfoFile {
	[key: string]: ILayerGroupInfo;
}

class BaseNode {
	constructor(public readonly name: string) {}

	public get dotName(): string {
		return this.name.replace(/-/g, "_").toLowerCase();
	}
}

class LayerNode extends BaseNode {
	public packages = new Set<PackageNode>();
	private readonly allowedDependentPackageNodes = new Set<PackageNode>();
	private readonly allowedDependentLayerNodes: LayerNode[] = [];

	constructor(
		name: string,
		public readonly layerInfo: ILayerInfo,
		private readonly groupNode: GroupNode,
	) {
		super(name);
	}

	public get doDot(): boolean {
		if (this.layerInfo.dot !== undefined) {
			return this.layerInfo.dot;
		}
		return !this.isDev && this.groupNode.doDot;
	}

	private get dotSameRank(): boolean {
		// default to false
		return this.layerInfo.dotSameRank ?? false;
	}

	public get isDev(): boolean {
		// default to false
		return this.layerInfo.dev ?? false;
	}

	/**
	 * Record that the given package is part of this layer
	 */
	public addPackage(packageNode: PackageNode): void {
		this.packages.add(packageNode);
	}

	/**
	 * Record that packages in this layer are allowed to depend on the given package
	 */
	public addAllowedDependentPackageNode(dep: PackageNode): void {
		this.allowedDependentPackageNodes.add(dep);
	}

	/**
	 * Record that packages in this layer are allowed to depend on packages in the given layer
	 */
	public addAllowedDependentLayerNode(dep: LayerNode): void {
		this.allowedDependentLayerNodes.push(dep);
	}

	public generateDotSubgraph(): string {
		if (!this.doDot) {
			return "";
		}
		const nodes = Array.from(
			this.packages.values(),
			(packageNode) => `"${packageNode.dotName}"`,
		);
		if (this.packages.size < 2) {
			return `\n    ${nodes.join("\n    ")}`;
		}
		const sameRank = this.dotSameRank ? '\n      rank="same"' : "";
		return `
    subgraph cluster_${this.dotName} {
      label = "${this.dotName}"${sameRank}
      ${nodes.join("\n      ")}
    }`;
	}

	/**
	 * Verify that this layer is allowed to depend on the given PackageNode
	 */
	public verifyDependent(dep: PackageNode): boolean {
		if (this.packages.has(dep)) {
			traceLayerCheck(`Found: ${dep.name} in ${this.name}`);
			return true;
		}
		if (this.allowedDependentPackageNodes.has(dep)) {
			traceLayerCheck(`Found: ${dep.name} in ${this.name}`);
			return true;
		}

		for (const node of this.allowedDependentLayerNodes) {
			traceLayerCheck(`Traversing: ${this.name} -> ${node.name}`);
			if (node.verifyDependent(dep)) {
				return true;
			}
		}
		return false;
	}
}

/**
 * Used for traversing the layer dependency graph
 */
interface LayerDependencyNode {
	node: LayerNode;
	orderedChildren: LayerNode[];
}

class GroupNode extends BaseNode {
	public layerNodes: LayerNode[] = [];

	constructor(
		name: string,
		private readonly groupInfo: ILayerGroupInfo,
	) {
		super(name);
	}

	public get doDot(): boolean {
		// default to true
		return this.groupInfo.dot ?? true;
	}

	private get dotSameRank(): boolean {
		// default to false
		return this.groupInfo.dotSameRank ?? false;
	}

	private get dotGroup(): boolean {
		// default to true
		return this.groupInfo.dotGroup ?? true;
	}

	public createLayerNode(name: string, layerInfo: ILayerInfo): LayerNode {
		const layerNode = new LayerNode(name, layerInfo, this);
		this.layerNodes.push(layerNode);
		return layerNode;
	}

	public generateDotSubgraph(): string {
		const sameRank = this.dotSameRank ? '\n    rank="same"' : "";
		const subGraphs = this.layerNodes
			.map((layerNode) => layerNode.generateDotSubgraph())
			.join("");
		if (!this.dotGroup) {
			return subGraphs;
		}
		return `
  subgraph cluster_group_${this.dotName} {
    label = "${this.dotName}"${sameRank}
    ${subGraphs}
  }`;
	}
}

class PackageNode extends BaseNode {
	private _pkg: Package | undefined;
	private readonly _childDependencies: PackageNode[] = [];
	private readonly depParents: PackageNode[] = [];
	private _indirectDependencies: Set<PackageNode> | undefined;
	private _level: number | undefined;

	constructor(
		name: string,
		public readonly layerNode: LayerNode,
	) {
		super(name);
	}

	public get layerName(): string {
		return this.layerNode.name;
	}

	public get isDev(): boolean {
		return this.layerNode.isDev;
	}

	public get doDot(): boolean {
		return this.layerNode.doDot;
	}

	public verifyDependent(dep: PackageNode): boolean {
		return this.layerNode.verifyDependent(dep);
	}

	public get dotName(): string {
		return this.name.replace(/@fluidframework\//i, "").replace(/@fluid-internal\//i, "");
	}

	public get pkg(): Package {
		if (!this._pkg) {
			throw new Error(`ERROR: Package missing from PackageNode ${this.name}`);
		}
		return this._pkg;
	}

	public set pkg(pkg: Package) {
		if (this._pkg) {
			throw new Error(`ERROR: Package assigned twice to a PackageNode ${this.name}`);
		}
		this._pkg = pkg;
	}

	public initializedDependencies(packageNodeMap: Map<string, PackageNode>): void {
		for (const dep of this.pkg.dependencies) {
			const depPackageNode = packageNodeMap.get(dep);
			if (depPackageNode) {
				this._childDependencies.push(depPackageNode);
				depPackageNode.depParents.push(this);
			}
		}
	}

	/**
	 * Packages this package is directly dependent upon
	 */
	public get childDependencies(): Readonly<PackageNode[]> {
		return this._childDependencies;
	}

	/**
	 * Packages this package is indirectly dependent upon
	 */
	public get indirectDependencies(): Set<PackageNode> {
		if (this._indirectDependencies === undefined) {
			// NOTE: recursive isn't great, but the graph should be small enough
			// eslint-disable-next-line unicorn/no-array-reduce
			this._indirectDependencies = this._childDependencies.reduce<Set<PackageNode>>(
				(accum, childPackage) => {
					for (const pkg of childPackage.childDependencies) accum.add(pkg);
					for (const pkg of childPackage.indirectDependencies) accum.add(pkg);
					return accum;
				},
				new Set<PackageNode>(),
			);
		}
		return this._indirectDependencies;
	}

	public get level(): number {
		if (this._level === undefined) {
			// eslint-disable-next-line unicorn/no-array-reduce
			this._level = this._childDependencies.reduce<number>((accum, childPackage) => {
				return Math.max(accum, childPackage.level + 1);
			}, 0);
		}
		return this._level;
	}
}

export class LayerGraph {
	private readonly groupNodes: GroupNode[] = [];
	private readonly layerNodeMap = new Map<string, LayerNode>();
	private readonly packageNodeMap = new Map<string, PackageNode>();
	/**
	 * List of all layers ordered such that all dependencies for a given layer appear earlier in the list
	 */
	private readonly orderedLayers: LayerDependencyNode[] = [];
	private dirMapping: { [key: string]: LayerNode } = {};

	private createPackageNode(name: string, layer: LayerNode): PackageNode {
		if (this.packageNodeMap.get(name)) {
			throw new Error(`ERROR: Duplicate package layer entry ${name}`);
		}
		const packageNode = new PackageNode(name, layer);
		this.packageNodeMap.set(name, packageNode);
		layer.addPackage(packageNode);
		return packageNode;
	}

	private constructor(root: string, layerInfo: ILayerInfoFile, packages: Package[]) {
		this.initializeLayers(root, layerInfo);
		this.initializePackages(packages);

		// Walk the layer dependency graph in order of least dependencies to build up orderedLayers and check for cycles
		this.traverseLayerDependencyGraph();
	}

	private initializeLayers(root: string, layerInfoFile: ILayerInfoFile): void {
		// First pass get the layer nodes
		for (const groupName of Object.keys(layerInfoFile)) {
			const groupInfo = layerInfoFile[groupName];
			const groupNode = new GroupNode(groupName, groupInfo);
			this.groupNodes.push(groupNode);

			for (const layerName of Object.keys(groupInfo.layers)) {
				const layerInfo = groupInfo.layers[layerName];
				const layerNode = groupNode.createLayerNode(layerName, layerInfo);
				this.layerNodeMap.set(layerName, layerNode);

				if (layerInfo.dirs) {
					for (const dir of layerInfo.dirs)
						this.dirMapping[path.resolve(root, dir)] = layerNode;
				}
				if (layerInfo.packages) {
					for (const pkg of layerInfo.packages) this.createPackageNode(pkg, layerNode);
				}

				if (layerInfo.dev && layerInfo.deps) {
					throw new Error(
						`ERROR: dev layers should not specify allowed deps since verification is skipped for dev layers (${layerName})`,
					);
				}
			}
		}

		// Wire up the allowed dependents
		for (const groupNode of this.groupNodes) {
			for (const layerNode of groupNode.layerNodes) {
				if (!layerNode.layerInfo.deps) {
					continue;
				}
				for (const depName of layerNode.layerInfo.deps) {
					const depLayer = this.layerNodeMap.get(depName);
					if (depLayer) {
						layerNode.addAllowedDependentLayerNode(depLayer);
					} else {
						const depPackage = this.packageNodeMap.get(depName);
						// eslint-disable-next-line max-depth
						if (depPackage === undefined) {
							throw new Error(
								`Missing package entry for dependency ${depName} in ${layerNode.name}`,
							);
						}
						layerNode.addAllowedDependentPackageNode(depPackage);
					}
				}
			}
		}
	}

	private initializePackages(packages: Package[]): void {
		this.initializePackageMatching(packages);
		this.initializeDependencies();
	}

	private initializePackageMatching(packages: Package[]): void {
		// Match the packages to the node if it is not explicitly specified
		for (const pkg of packages) {
			const packageNode = this.packageNodeMap.get(pkg.name);
			if (packageNode) {
				packageNode.pkg = pkg;
				continue;
			}
			let matched = false;
			for (const dir of Object.keys(this.dirMapping)) {
				if (pkg.directory.startsWith(dir)) {
					const layerNode = this.dirMapping[dir];
					traceLayerCheck(`${pkg.nameColored}: matched with ${layerNode.name} (${dir})`);
					const newPackageNode = this.createPackageNode(pkg.name, layerNode);
					newPackageNode.pkg = pkg;
					matched = true;
					break;
				}
			}
			if (!matched) {
				throw new Error(
					`${pkg.nameColored}: ERROR: Package doesn't match any directories. Unable to do dependency check. Check that the package is listed in data/layerInfo.json.`,
				);
			}
		}
	}

	private initializeDependencies(): void {
		for (const packageNode of this.packageNodeMap.values()) {
			packageNode.initializedDependencies(this.packageNodeMap);
		}
	}

	private forEachDependencies(
		exec: (src: PackageNode, dest: PackageNode) => boolean,
	): boolean {
		let success = true;
		// Go thru the packages and check for dependency violation
		for (const packageNode of this.packageNodeMap.values()) {
			for (const depPackageNode of packageNode.childDependencies) {
				if (!exec(packageNode, depPackageNode)) {
					success = false;
				}
			}
		}
		return success;
	}

	public verify(): boolean {
		return this.forEachDependencies((packageNode, depPackageNode) => {
			if (packageNode.isDev) {
				// Don't check dependency on test packages
				return true;
			}
			let success = true;
			if (depPackageNode.isDev) {
				console.error(
					`${packageNode.pkg.nameColored}: error: dev packages appearing in package dependencies instead of devDependencies - ${depPackageNode.name}, `,
				);
				success = false;
			}

			traceLayerCheck(
				`${packageNode.pkg.nameColored}: checking ${depPackageNode.name} from ${packageNode.layerName}`,
			);
			if (!packageNode.verifyDependent(depPackageNode)) {
				console.error(
					`${packageNode.pkg.nameColored}: error: Dependency layer violation ${depPackageNode.name}, "${packageNode.layerName}" -> "${depPackageNode.layerName}"`,
				);
				success = false;
			}
			return success;
		});
	}

	public generateDotGraph(): string {
		const dotEdges: string[] = [];
		this.forEachDependencies((packageNode, depPackageNode) => {
			if (packageNode.doDot && !packageNode.indirectDependencies.has(depPackageNode)) {
				const suffix = packageNode.indirectDependencies.has(depPackageNode)
					? " [constraint=false color=lightgrey]"
					: packageNode.layerNode !== depPackageNode.layerNode &&
							packageNode.level - depPackageNode.level > 3
						? " [constraint=false]"
						: "";
				dotEdges.push(`"${packageNode.dotName}"->"${depPackageNode.dotName}"${suffix}`);
			}
			return true;
		});
		const dotGraph = `strict digraph G { graph [ newrank=true; ranksep=2; compound=true ]; ${this.groupNodes
			.map((group) => group.generateDotSubgraph())
			.join("")}
  ${dotEdges.join("\n  ")}
}`;
		return dotGraph;
	}

	private padArraysToSameLength(a: string[], b: string[], val: string): void {
		while (a.length !== b.length) {
			if (a.length < b.length) {
				a.push(val);
			} else {
				b.push(val);
			}
		}
	}

	/**
	 * Walk the layers in order such that a layer's dependencies are visited before that layer.
	 * In doing so, we can also validate that the layer dependency graph has no cycles.
	 */
	private traverseLayerDependencyGraph(): void {
		// Walk all packages, grouping by layers and which layers contain dependencies of that layer
		const layers: (LayerDependencyNode & { childrenToVisit: LayerNode[] })[] = [];
		for (const groupNode of this.groupNodes) {
			for (const layerNode of groupNode.layerNodes) {
				const childLayers: Set<LayerNode> = new Set();
				for (const packageNode of layerNode.packages) {
					for (const p of packageNode.childDependencies) childLayers.add(p.layerNode);
				}
				layers.push({
					node: layerNode,
					childrenToVisit: [...childLayers].filter((l) => l.name !== layerNode.name),
					orderedChildren: [],
				});
			}
		}

		// Traverse the layers in order of least dependencies.
		// OrderedLayers, and orderedChildren for each layer, will reflect that ordering
		for (
			let nextIndex = layers.findIndex((l) => l.childrenToVisit.length === 0);
			nextIndex >= 0;
			nextIndex = layers.findIndex((l) => l.childrenToVisit.length === 0)
		) {
			// Move this childless child dependecy node to orderedLayers
			const [childDepNode] = layers.splice(nextIndex, 1);
			this.orderedLayers.push(childDepNode);

			// Update all dependent layers. After this at least one layer will have no more children to visit.
			for (const l of layers) {
				const foundIdx = l.childrenToVisit.findIndex(
					(child) => child.name === childDepNode.node.name,
				);
				if (foundIdx >= 0) {
					// Move this child node to orderedChildren for each dependent layer
					const [childNode] = l.childrenToVisit.splice(foundIdx, 1);
					l.orderedChildren.push(childNode);
				}
			}
		}

		// When we exit the loop above, layers will be empty... unless the layer dependency graph has cycles.
		// If that's the case, throw an error showing the remaining layers and dependencies to highlight the cycle.
		if (layers.length > 0) {
			const remainingLayers = layers.map(
				(l) => `${l.node.name} --> ${l.childrenToVisit.map((c) => c?.name)}`,
			);
			const errorMessage = `
ERROR: Circular dependency detected between layers!
Please inspect these layers and their dependencies to find the cycle:

${remainingLayers.join(newline)}

Note that the dependency may not be explicit in the layer info JSON,
and doesn't indicate a strict circular dependency between packages.
But some packages in layer A depend on packages in layer B, and likewise some in B depend on some in A.`;
			throw new Error(errorMessage);
		}
	}

	/**
	 * Generate a markdown-formated list of layers listing their packages and dependencies
	 */
	public generatePackageLayersMarkdown(repoRoot: string): string {
		const lines: string[] = [];
		let packageCount: number = 0;
		for (const layerDepNode of this.orderedLayers) {
			const layerNode = layerDepNode.node;
			lines.push(`### ${layerNode.name}${newline}`);
			const packagesInCell: string[] = [];
			for (const packageNode of layerNode.packages) {
				++packageCount;
				const dirRelativePath = `/${path
					.relative(repoRoot, packageNode.pkg.directory)
					.replace(/\\/g, "/")}`;
				const ifPrivate = packageNode.pkg.isPublished ? "" : " (private)";
				packagesInCell.push(`- [${packageNode.name}](${dirRelativePath})${ifPrivate}`);
			}

			const layersInCell: string[] = [];
			for (const childLayer of layerDepNode.orderedChildren) {
				layersInCell.push(`- [${childLayer.name}](#${childLayer.name})`);
			}

			this.padArraysToSameLength(packagesInCell, layersInCell, "&nbsp;");
			lines.push(`| Packages | Layer Dependencies |`, `| --- | --- |`);
			// eslint-disable-next-line unicorn/no-array-push-push
			lines.push(
				`| ${packagesInCell.join("</br>")} | ${layersInCell.join("</br>")} |${newline}`,
			);
		}

		assert(
			packageCount === this.packageNodeMap.size,
			"ERROR: Did not find all packages while traversing layers",
		);

		const packagesMdContents: string = `# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

_These are the logical layers into which our packages are grouped.
The dependencies between layers are enforced by the layer-check command._

${lines.join(newline)}
`;
		return packagesMdContents;
	}

	public static load(root: string, packages: Package[], info?: string): LayerGraph {
		const layerInfoFile = info ?? path.join(__dirname, "..", "..", "data", "layerInfo.json");
		const layerData = readJsonSync(layerInfoFile) as ILayerInfoFile;
		return new LayerGraph(root, layerData, packages);
	}
}
