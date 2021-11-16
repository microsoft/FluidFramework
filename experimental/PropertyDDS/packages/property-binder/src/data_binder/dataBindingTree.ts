/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Defines a data structure for storing an DataBinding tree that mirrors a property set hierarchy with
 * DataBindings representing certain properties. Meant to handle the case where there are many properties but only some
 * nodes are represented by data bindings. Supports array pathing as we well.
 *
 * TODO: this is getting a bit messy. Refactor to have a(n abstract) baseclass and proper derived classes
 */
import _ from "underscore";
import { PathHelper } from "@fluid-experimental/property-changeset";
import {
    PATH_TOKENS_TYPE,
    TOKEN_TYPES_TYPE,
} from "@fluid-experimental/property-properties";
import { DataBinding } from "./dataBinding";

export type NodeType = DataBindingTree | ArrayNode | null | undefined;
interface Value {
    pathCallbacks?: Record<string, Array<{
        pathCallback: Function
    }>>;
    representations?: Map<string, any>;
    ordered?: DataBinding[],
    groupedByDataBindingType?: Map<string, DataBinding>
}

export type NodeValue = Value | null;



/**
 * Helper function: returns true if and only if the given string parses as a non-negative integer.
 *
 * @param str - The string we want to check whether it is
 * @returns True if the string is a non-negative integer, false otherwise.
 *
 * @package
 * @hidden
 */
const isNormalInteger = function (str: string | number): boolean {
    let n = Math.floor(Number(str));
    return String(n) === str && n >= 0;
};

/**
 * Helper function: reconstruct a tokenized path up to (but not including) a position.
 *
 * @param in_tokenizedPath - tokenized path
 * @param in_pathDelimiters - token types for the path
 * @param  in_position - position in the path (must be >= 0 <= the length of the tokenized path)
 * @returns reconstructed path
 * @constructor
 * @package
 * @hidden
 */
export function concatTokenizedPath(
    in_tokenizedPath: (string | number)[],
    in_pathDelimiters: TOKEN_TYPES_TYPE[],
    in_position: number
): string {
    let path = "";
    for (let i = 0; i < in_position; ++i) {
        if (in_pathDelimiters[i] === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
            path += "[" + in_tokenizedPath[i] + "]";
        } else {
            if (i > 0) {
                path += ".";
            }
            path += in_tokenizedPath[i];
        }
    }
    return path;
}

/**
 * Helper function: tokenize a path and swallow the leading '/' token if necessary.
 *
 * @param in_path - tokenized path
 * @param out_pathDelimiters - token types for the path
 * @returns tokenized path
 *
 * @private
 * @hidden
 */
const _tokenizePath = function (
    in_path: string,
    out_pathDelimiters: PATH_TOKENS_TYPE[]
): Array<string | number> {
    let tokenizedPath = PathHelper.tokenizePathString(
        in_path,
        out_pathDelimiters
    );
    if (out_pathDelimiters[0] === PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN) {
        out_pathDelimiters.shift();
        tokenizedPath.shift();
    }
    return tokenizedPath;
};

/**
 * An DataBindingTree is a tree structure that is intended to reflect the structure of a property set hierarchy
 * but doesn't inherently have values at all nodes.
 *
 * @ignore
 * @alias DataBindingTree
 * @package
 * @hidden
 */
export class DataBindingTree {
    _value: NodeValue = null;

   _childNodes: any; // @TODO extract this property to common interface/abstract class, ArrayNode uses it as [], and the rest
                     // as an object.

    /**
     * Constructor
     * @constructor
     */
    constructor() {
        this._value = null; // The value at this node

        this._childNodes = {};
    }

    /**
     * Returns the value stored at this node.
     *
     * @returns The value stored at this node.
     * @package
     */
    getValue(): NodeValue {
        return this._value;
    }

    /**
     * @param value The value to store at this node
     */
    setValue(value: NodeValue) {
        this._value = value;
    }

    /**
     * @param in_tokens - tokenized path
     *
     * @returns the path
     */
    generatePathFromTokens(in_tokens: (string | number)[]): string | undefined {
        return this._generatePathFromTokensInternal(0, in_tokens);
    }

    /**
     * Compute the number of nodes that are needed and wasted in the subtree. The count covers all nodes in the
     * subtree, including this node. A node is needed if it is holding a value, or if it is needed to represent
     * the tree structure to hold a needed node deeper in the hierarchy. Otherwise it is wasted.
     *
     * @returns the number of nodes
     * that are needed in the subtree, and the number that are wasted. 'gen' is for a general node, and 'arrays' is
     * for nodes that are specifically known to be array nodes.
     */
    _computeUsage(): {
        genNeeded: number;
        genWasted: number;
        arraysNeeded: number;
        arraysWasted: number;
    } {
        const result = {
            genNeeded: 0,
            genWasted: 0,
            arraysNeeded: 0,
            arraysWasted: 0,
        };
        let thisNeeded = this._value !== null && this._value !== undefined;
        const isArray = this instanceof ArrayNode;
        let keys = Object.keys(this._childNodes);
        for (let i = 0; i < keys.length; i++) {
            const childUsage = this._childNodes[keys[i]]._computeUsage();
            thisNeeded =
                thisNeeded ||
                childUsage.genNeeded > 0 ||
                childUsage.arraysNeeded > 0;
            result.genNeeded += childUsage.genNeeded;
            result.genWasted += childUsage.genWasted;
            result.arraysNeeded += childUsage.arraysNeeded;
            result.arraysWasted += childUsage.arraysWasted;
        }
        if (thisNeeded) {
            if (isArray) {
                result.arraysNeeded++;
            } else {
                result.genNeeded++;
            }
        } else {
            if (isArray) {
                result.arraysWasted++;
            } else {
                result.genWasted++;
            }
        }
        return result;
    }

    /**
     *
     * @param in_from - index from which to generate the path
     * @param in_tokens - the tokens to generate a path for
     *
     * @returns The formatted string, or undefined if tokens are an invalid path
     */
    _generatePathFromTokensInternal(
        in_from: number,
        in_tokens: (string | number)[]
    ): string | undefined {
        if (in_from < in_tokens.length) {
            const child = this._childNodes[in_tokens[in_from]];
            const childPath = child
                ? child._generatePathFromTokensInternal(in_from + 1, in_tokens)
                : undefined;
            if (childPath !== undefined) {
                if (in_from) {
                    return "." + in_tokens[in_from] + childPath;
                } else {
                    return in_tokens[in_from] + childPath;
                }
            } else {
                return undefined;
            }
        } else {
            return "";
        }
    }

    /**
     * Returns the node in the tree that is the farthest along the given path.
     *
     * @param in_tokenizedPath - tokenized path to be removed
     * @param in_pathDelimiters - token types for the path
     * @param in_position - where we are along the path
     * @param in_parent - parent node (only used by ArrayNode/MapNode)
     *
     * @returns The node farthest along the path and the corresponding
     * (partial) path
     * @private
     */
    _getClosestNode(
        in_tokenizedPath: (string | number)[],
        in_pathDelimiters: PATH_TOKENS_TYPE[],
        in_position: number,
        _in_parent?: DataBindingTree | ArrayNode
    ): any {
        // we're at the end of the path, return this node
        if (in_position === in_tokenizedPath.length) {
            return {
                path: concatTokenizedPath(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position
                ),
                node: this,
            };
        }
        if (this._childNodes.hasOwnProperty(in_tokenizedPath[in_position])) {
            return this._childNodes[
                in_tokenizedPath[in_position]
            ]._getClosestNode(
                in_tokenizedPath,
                in_pathDelimiters,
                in_position + 1,
                this
            );
        } else {
            // can't follow the path -> return this node and the path so far
            return {
                path: concatTokenizedPath(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position
                ),
                node: this,
            };
        }
    }

    /**
     * Returns the node in the tree that is the farthest along the given path.
     *
     * @param path - The path
     * @returns The deepest node in the tree
     * @package
     */
    getClosestNode(path: string): any {
        // if given an empty path, just return this node
        if (path === "") {
            return { path: "", node: this };
        }
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(path, pathDelimiters);
        return this._getClosestNode(tokenizedPath, pathDelimiters, 0);
    }

    /**
     * Returns the node in the tree that is at the given path (if one exists).
     *
     * @param in_tokenizedPath - tokenized path to the node
     * @param in_position - where we are along the path
     * @param in_pathDelimiters - token types for the path
     * @param io_collectedNodes - (optional) collect nodes along the path in this array
     * @returns The node at the path if one exists, null otherwise.
     * @private
     */
    _getNode(
        in_tokenizedPath: (string | number)[],
        in_position: number,
        in_pathDelimiters?: PATH_TOKENS_TYPE[],
        io_collectedNodes?: DataBindingTree[]
    ): NodeType {
        if (io_collectedNodes) {
            io_collectedNodes.push(this);
        }
        // we're at the end of the path, return this node
        if (in_position === in_tokenizedPath.length) {
            return this;
        }
        if (this._childNodes.hasOwnProperty(in_tokenizedPath[in_position])) {
            return this._childNodes[in_tokenizedPath[in_position]]._getNode(
                in_tokenizedPath,
                in_position + 1,
                in_pathDelimiters,
                io_collectedNodes
            );
        } else {
            // can't follow the path
            return null;
        }
    }

    /**
     * Returns the node in the tree that is at the given path (if one exists).
     *
     * @param path - The path to search for.
     * @returns The node at the path if one exists, null otherwise.
     * @package
     */
    getNode(path: string): NodeType {
        // if given an empty path, just return this node
        if (path === "") {
            return this;
        }
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(path, pathDelimiters);
        return this._getNode(tokenizedPath, 0, pathDelimiters);
    }

    /**
     * Returns the node in the tree that is at the given tokenized path (if one exists).
     *
     * @param tokenizedPath - The tokenized path
     * @returns The node at the path if one exists, null otherwise.
     * @package
     */
    getNodeForTokenizedPath(
        tokenizedPath: Array<string | number>
    ): NodeType {
        return this._getNode(tokenizedPath, 0);
    }

    /**
     * Internal function: insert the value into the tree using the tokenized path and calling itself recursively.
     *
     * @param in_tokenizedPath - tokenized path to the value
     * @param in_pathDelimiters - token types for the path
     * @param in_position - where we are along the path
     * @param in_value - The value to insert into the tree
     * @returns The node that was created for the value
     */
    _insert(
        in_tokenizedPath: (string | number)[],
        in_pathDelimiters: PATH_TOKENS_TYPE[],
        in_position: number,
        in_value: any
    ): NodeType {
        // we're at the end of the path, set the value and return this node
        if (in_position === in_tokenizedPath.length) {
            this._value = in_value;
            return this;
        }
        if (this._childNodes.hasOwnProperty(in_tokenizedPath[in_position])) {
            // we already have this child -> defer inserting to this child
            return this._childNodes[in_tokenizedPath[in_position]]._insert(
                in_tokenizedPath,
                in_pathDelimiters,
                in_position + 1,
                in_value
            );
        } else {
            // we need to add this path segment as a new child
            if (
                in_position < in_tokenizedPath.length - 1 &&
                in_pathDelimiters[in_position + 1] ===
                    PathHelper.TOKEN_TYPES.ARRAY_TOKEN
            ) {
                // the next path segment is a collection node so create an array of map childnode and continue
                let collectionNode = isNormalInteger(
                    in_tokenizedPath[in_position + 1]
                )
                    ? new ArrayNode()
                    : new DataBindingTree();
                this._childNodes[in_tokenizedPath[in_position]] =
                    collectionNode;
                return collectionNode._insert(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position + 1,
                    in_value
                );
            } else {
                // the next path segment isn't a collection so create a DataBindingTree child and continue
                let node = new DataBindingTree();
                this._childNodes[in_tokenizedPath[in_position]] = node;
                return node._insert(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position + 1,
                    in_value
                );
            }
        }
    }

    /**
     * @param in_tokenizedPathOrToken - Tokenized path
     * @param in_propertyContext - Property context
     * @returns node
     */
    insertChild(
        in_tokenizedPathOrToken: Array<string | number> | string | number,
        in_propertyContext: string
    ): NodeType {
        let currentNode: DataBindingTree = this;
        let node: NodeType;
        let token: string | number;
        if (_.isArray(in_tokenizedPathOrToken)) {
            for (let i = 0; i < in_tokenizedPathOrToken.length - 1; i++) {
                if (currentNode._childNodes[in_tokenizedPathOrToken[i]]) {
                    currentNode =
                        currentNode._childNodes[in_tokenizedPathOrToken[i]];
                } else {
                    node = new DataBindingTree();
                    currentNode._childNodes[in_tokenizedPathOrToken[i]] = node;
                    currentNode = node;
                }
            }

            token = in_tokenizedPathOrToken[in_tokenizedPathOrToken.length - 1];
        } else {
            token = in_tokenizedPathOrToken;
        }
        if (currentNode._childNodes[token]) {
            const isMapNode = currentNode._childNodes[token] instanceof MapNode;
            const isArrayNode =
                currentNode._childNodes[token] instanceof ArrayNode;
            if (in_propertyContext === "map") {
                if (!isMapNode) {
                    this._convertToMapNode(currentNode, token);
                }
            } else if (in_propertyContext === "array") {
                if (!isArrayNode) {
                    this._convertToArrayNode(currentNode, token);
                }
            } else {
                // Better not be special
                if (isArrayNode || isMapNode) {
                    this._convertFromSpecializedNode(currentNode, token);
                }
            }
            node = currentNode._childNodes[token];
        } else {
            node = DataBindingTree._createDataBindingTreeNodeForContext(in_propertyContext);
            currentNode._childNodes[token] = node;
        }
        return node;
    }

    /**
     * Insert a node at the given (absolute) path into the tree with the given value.
     *
     * The path may contain any number of non-existing elements or array indices larger than an existing array's length,
     * these will be inserted into the tree as necessary.
     *
     * This function assumes that a) the path we insert here does not exist yet. Parts of it may exist, but not the
     *                               entire path. If a path ends with an element in a collection, the collection may
     *                               exist already.
     *                            b) the new node will contain a path callback.
     *
     * @param in_absolutePath - the path to be inserted
     * @param in_value - The value of the newly inserted node
     * @returns The node that was created for the value
     * @package
     */
    insertNodeForPathCallback(
        in_absolutePath: string,
        in_value?: any
    ): NodeType {
        const pathDelimiters = [];
        const tokenizedPath = _tokenizePath(in_absolutePath, pathDelimiters);
        const lastElem = tokenizedPath.pop();
        const parentNode = this.getNodeForTokenizedPath(tokenizedPath);
        let originalLength = 0;
        // we need to handle the case where we insert into an existing array
        if (parentNode instanceof ArrayNode) {
            console.assert(!isNaN(lastElem as any));
            originalLength = (parentNode._childNodes as any).length; // @TODO revisit this, when _childNodes can be array ???
        }
        tokenizedPath.push(lastElem!); // put it back
        // we pretend the property context is 'single' because we don't want any arrays to be created
        let newNode = DataBindingTree.prototype.insertChild.call(
            this,
            tokenizedPath,
            "single"
        );
        if (parentNode instanceof ArrayNode) {
            if (parentNode._highestPathCallbackIndex === -1) {
                parentNode._actualLength = originalLength;
            }
            // if the array already contained a child with a path callback but the new index is higher, we have to update it
            if (lastElem! > parentNode._highestPathCallbackIndex) {
                parentNode._highestPathCallbackIndex = parseInt(lastElem as string, 10);
            }
        }
        if (in_value) {
            newNode!.setValue(in_value);
        }
        return newNode;
    }

    /**
     * Make sure that if a node with path callbacks is in an array container, this is correctly flagged in the array.
     *
     * @param in_absolutePath - the path to the node
     * @package
     */
    setNodeForPathCallback(in_absolutePath: string) {
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(in_absolutePath, pathDelimiters);
        // we need to check whether the last but one element is an ArrayNode and make sure it's updated correctly
        let index = tokenizedPath[tokenizedPath.length - 1];
        tokenizedPath.pop();
        let node = this.getNodeForTokenizedPath(tokenizedPath);
        if (node instanceof ArrayNode) {
            index = parseInt(index as string, 10);
            console.assert(
                !isNaN(index) && index >= 0 && index < node._childNodes.length
            );
            console.assert(
                node._highestPathCallbackIndex === -1 ||
                    index < node._actualLength
            );
            if (node._highestPathCallbackIndex === -1) {
                node._actualLength = node._childNodes.length;
            }
            // if the array already contained a child with a path callback but the new index is higher, we have to update it
            if (index > node._highestPathCallbackIndex) {
                node._highestPathCallbackIndex = index;
            }
        }
    }

    /**
     * Internal function: convert a MapNode or ArrayNode child to a vanilla DataBindingTree node.
     *
     * @param io_parentNode - parent node whose child we convert
     * @param in_key - key (index) of the child we want to replace
     */
    protected _convertFromSpecializedNode(
        io_parentNode: DataBindingTree | ArrayNode | MapNode,
        in_key: string | number
    ) {
        let replacementNode = new DataBindingTree();
        // this syntax should work both for ArrayNodes and DataBindingTree parent nodes
        let oldNode = io_parentNode._childNodes[in_key];
        console.assert(
            oldNode instanceof ArrayNode || oldNode instanceof MapNode
        );
        for (let i = 0; i < oldNode._childNodes.length; ++i) {
            if (oldNode._childNodes[i]) {
                replacementNode._childNodes[i] = oldNode._childNodes[i];
            }
        }
        replacementNode._value = oldNode._value;
        io_parentNode._childNodes[in_key] = replacementNode;
    }

    /**
     * Internal function: convert a DataBindingTree child to an ArrayNode.
     *
     * It is assumed that the key of all children are numeric. The new node's _highestPathCallbackIndexA flag will be set
     * to signal that this must have path callbacks. If the keys are not continuous, array elements that don't
     * have corresponding keys will be left as "undefined".
     *
     * @param io_parentNode - parent node whose child we convert
     * @param in_key - key (index) of the child we want to replace
     */
    protected _convertToArrayNode(
        io_parentNode: DataBindingTree | ArrayNode,
        in_key: string | number
    ) {
        let replacementNode = new ArrayNode();
        // this syntax should work both for ArrayNodes and DataBindingTree parent nodes
        let oldDataBindingTreeNode = io_parentNode._childNodes[in_key];
        console.assert(oldDataBindingTreeNode instanceof DataBindingTree);
        let keys = Object.keys(oldDataBindingTreeNode._childNodes);
        let maxIndex = -1;
        for (let i = 0; i < keys.length; ++i) {
            console.assert(isNormalInteger(keys[i]));
            const key =  Number.parseInt(keys[i], 10) ;
            maxIndex = key > maxIndex ? key : maxIndex;
            replacementNode._childNodes[keys[i]] =
                oldDataBindingTreeNode._childNodes[keys[i]];
        }
        replacementNode._highestPathCallbackIndex = maxIndex;
        replacementNode._value = oldDataBindingTreeNode._value;
        io_parentNode._childNodes[in_key] = replacementNode;
    }

    /**
     * Internal function: convert a DataBindingTree child to a MapNode.
     *
     * @param io_parentNode - parent node whose child we convert
     * @param in_key - key (index) of the child we want to replace
     */
    private _convertToMapNode(
        io_parentNode: DataBindingTree | MapNode,
        in_key: string | number
    ) {
        let replacementNode = new MapNode();
        // this syntax should work both for ArrayNodes and DataBindingTree parent nodes
        let oldDataBindingTreeNode = io_parentNode._childNodes[in_key];
        console.assert(oldDataBindingTreeNode instanceof DataBindingTree);
        let keys = Object.keys(oldDataBindingTreeNode._childNodes);
        for (let i = 0; i < keys.length; ++i) {
            replacementNode._childNodes[keys[i]] =
                oldDataBindingTreeNode._childNodes[keys[i]];
        }
        replacementNode._value = oldDataBindingTreeNode._value;
        io_parentNode._childNodes[in_key] = replacementNode;
    }

    /**
     * @param in_context - Context
     * @returns Node/Tree
     */
    static _createDataBindingTreeNodeForContext(
        in_context: string
    ): MapNode | NodeType {
        if (in_context === "array") {
            return new ArrayNode();
        } else if (in_context === "map") {
            return new MapNode();
        } else {
            return new DataBindingTree();
        }
    }

    /**
     * Inserts the value into the tree at the provided path.
     *
     * @param in_path  - The path to the value
     * @param in_value - The value to insert into the tree
     * @returns The node that was created for the path
     * @package
     */
    insert(in_path: string, in_value: any): NodeType {
        // if given an empty path, just return this node
        if (in_path === "") {
            this._value = in_value;
            return this;
        }
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(in_path, pathDelimiters);
        return this._insert(tokenizedPath, pathDelimiters, 0, in_value);
    }

    /**
     * Internal function: removes a sub tree using the tokenized path and calling itself recursively.
     *
     * @param in_tokenizedPath - tokenized path to be removed
     * @param in_pathDelimiters - token types for the path
     * @param in_position - where we are along the path
     * @returns The root of the subtree that was removed, or null
     * @private
     */
     _remove(
        in_tokenizedPath: (string | number)[],
        in_pathDelimiters: TOKEN_TYPES_TYPE[],
        in_position: number
    ): NodeType {
        if (this._childNodes.hasOwnProperty(in_tokenizedPath[in_position])) {
            if (in_position === in_tokenizedPath.length - 1) {
                // we're at at the end of the path -> need to remove a direct child
                let node = this._childNodes[in_tokenizedPath[in_position]];
                delete this._childNodes[in_tokenizedPath[in_position]];
                return node;
            } else {
                // not yet the end of the path, need to continue with our child
                return this._childNodes[in_tokenizedPath[in_position]]._remove(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position + 1
                );
            }
        } else {
            // we can't go on with the path, return null and don't do anything
            return null;
        }
    }

    /**
     * Removes a sub tree
     *
     * @param in_path - The path to remove. If empty, just returns itself (nothing is removed).
     * @returns The subtree that was removed. Null if nothing was removed
     * @package
     */
    remove(in_path: string): NodeType {
        // if given an empty path, just return this node
        if (in_path === "") {
            return this;
        }
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(in_path, pathDelimiters);
        return this._remove(tokenizedPath, pathDelimiters, 0);
    }

    /**
     * Calls a function with each value stored in the tree.
     *
     * @param callback       - The function to call. Called with the value of each node.
     * @param postCallback - Function which is called after all child nodes have been processed
     * @param - The path up to this node
     * @package
     */
    forEachChild(
        callback: Function,
        postCallback?: Function,
        in_path: (string | number)[] = []
    ) {
        callback(this._value, in_path, this);

        let keys = _.keys(this._childNodes);
        for (let i = 0; i < keys.length; i++) {
            in_path.push(keys[i]);
            this._childNodes[keys[i]].forEachChild(
                callback,
                postCallback,
                in_path
            );
            in_path.pop();
        }

        if (postCallback) {
            postCallback(this._value, in_path, this);
        }
    }

    /**
     * Returns a boolean indicating whether the node has children (i.e. is a leaf)
     *
     * @returns true if we have children
     * @package
     */
    hasChildren(): boolean {
        return !_.isEmpty(this._childNodes);
    }

    /**
     * Returns an array of nodes that make up the given path in the tree
     * // @TODO currently unused.
     * @param in_path - the path
     *
     * @returns the array of nodes
     * @package
     */
    getNodesInPath(in_path: string): Array<NodeType> {
        let nodes = [];
        // if given an empty path, just an empty array
        if (in_path === "") {
            return nodes;
        }
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(in_path, pathDelimiters);
        if (pathDelimiters[0] === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
            throw new Error("Path cannot begin with an array: " + in_path);
        }
        this._getNode(tokenizedPath, 0, pathDelimiters, nodes);
        return nodes;
    }

    /**
     * Returns a map of paths to the children
     *
     * @returns The map of children
     * @package
     */
    getChildren(): { [s: string]: DataBindingTree } {
        let that = this;

        let children = {};
        _.keys(this._childNodes).forEach(function (key) {
            // Get our immediate children
            if (that._childNodes[key] instanceof DataBindingTree) {
                children[key] = that._childNodes[key];
                return;
            }

            // The fact that paths with collections are stored in new nodes should be transparent to the user
            // of DataBindingTree. So we also have to return the nodes stored in any ArrayNodes or MapNodes we may have.
            that._childNodes[key]
                .getChildren()
                .forEach(function (childInfo: { path: string; node: any }) {
                    children[key + childInfo.path] = childInfo.node;
                });
        });

        return children;
    }

    /**
     * Collect all subtree paths from a node into a set
     *
     * @param in_currentPath - the path we've come so far
     * @param in_paths - the set into which we're collecting
     * @private
     */
    _getSubtreePaths(in_currentPath: string, in_paths: Set<string>) {
        // first collect the paths for our direct children
        let that = this;
        let keys = _.keys(this._childNodes);
        let pathSeparator = in_currentPath !== "" ? "." : "";
        keys.forEach(function (key) {
            // Get our immediate children that are not collection nodes (collection nodes will handle their own)
            if (that._childNodes[key] instanceof DataBindingTree) {
                in_paths.add(in_currentPath + pathSeparator + key);
            }
        });
        // then recurse into our children
        for (let i = 0; i < keys.length; i++) {
            this._childNodes[keys[i]]._getSubtreePaths(
                in_currentPath + pathSeparator + keys[i],
                in_paths
            );
        }
    }

    /**
     * Returns a set of paths (relative to this node) to all nodes in the subtree from this node
     *
     * @returns The subtree paths as a set of strings
     * @package
     */
    getSubtreePaths(): Set<string> {
        let paths: Set<string> = new Set();
        this._getSubtreePaths("", paths);
        return paths;
    }

    /**
     * Returns the immediate child with the given name of this node
     *
     * @param in_child - the name of the child or an array of names
     * if an array is passed, the .getChild() function will be performed on each child in sequence
     * for example .get(['position','x']) is equivalent to .get('position').get('x')
     * @returns The specified child node (or undefined)
     * @package
     */
    getChild(in_child: string | Array<string>): NodeType {
        let that = this;
        if (_.isArray(in_child)) {
            let child: NodeType = undefined;
            in_child.forEach(function (act_child) {
                if (!child) {
                    child = that.getChild(act_child);
                } else {
                    child = child.getChild(act_child);
                }
            });
            return child;
        } else {
            return this._childNodes[in_child];
        }
    }

    /**
     * Removes the subtree of a direct child
     *
     * @param in_child - the name of the child to remove
     * @returns The subtree that was removed. Null if nothing was removed
     * @package
     */
    removeChild(in_child: number | string): NodeType {
        if (this._childNodes.hasOwnProperty(in_child)) {
            let node = this._childNodes[in_child];
            delete this._childNodes[in_child];
            return node;
        } else {
            // unknown child, return null don't do anything
            return null;
        }
    }

    /**
     * Return a data binding of the provided type
     * @param in_bindingType - The requested bindingType
     * @returns A data binding of the provided type or undefined if no data binding is
     *         present.
     * @package
     */
    getDataBindingByType(in_bindingType: string): DataBinding | undefined {
        const value = this.getValue();
        let groupedByType =
            value &&
            value.groupedByDataBindingType &&
            value.groupedByDataBindingType.get(in_bindingType);
        if (groupedByType) {
            return groupedByType;
        } else {
            return undefined;
        }
    }

    /**
     * Returns an array of Data Bindings that are present at this node.
     *
     * @returns An array of Data Binders in registration order,
     * which may be empty if no suitable data bindings are present at the node.
     * @package
     */
    getDataBindings(): Array<DataBinding> {
        if (!this._value) {
            return [];
        }
        return this._value.ordered || [];
    }
}

/**
 * A MapNode is a node in the DataBinding tree that contains a map of sub trees.
 *
 * @constructor
 * @ignore
 * @package
 */
export class MapNode extends DataBindingTree {
    /**
     *
     * @param in_from - index from which to generate the path
     * @param in_tokens - the tokens to generate a path for
     *
     * @returns the formatted string, or undefined if tokens are an invalid path
     */
    _generatePathFromTokensInternal(
        in_from: number,
        in_tokens: string[]
    ): string | undefined {
        if (in_from < in_tokens.length) {
            const child = this._childNodes[in_tokens[in_from]];
            const childPath = child
                ? child._generatePathFromTokensInternal(in_from + 1, in_tokens)
                : undefined;
            if (childPath !== undefined) {
                return "[" + in_tokens[in_from] + "]" + childPath;
            } else {
                return undefined;
            }
        } else {
            return "";
        }
    }
}

/**
 * An ArrayNode is a node in the DataBinding tree that contains an array of sub trees.
 *
 * @constructor
 * @ignore
 * @package
 */
export class ArrayNode extends DataBindingTree {
    _highestPathCallbackIndex: number;

    _actualLength: number;

    /**
     * Constructor
     */
    constructor() {
        super();
        this._childNodes = []; // our child nodes are held in an array container!
        this._highestPathCallbackIndex = -1; // -1 if the array does not have children with associated path callbacks
        // or the index of highest such child otherwise. If it was converted from a
        // collection of DataBindingTree nodes, it initially contains the highest index
        // in that collection.
        this._actualLength = 0; // if this ArrayNode was converted from DataBindingTree nodes, the length of
        // the "real" array (i.e. the part of the array that has corresponding
        // properties)
    }

    /**
     *
     * @param in_from - index from which to generate the path
     * @param in_tokens - the tokens to generate a path for
     *
     * @returns the formatted string, or undefined if tokens are an invalid path
     */
    _generatePathFromTokensInternal(
        in_from: number,
        in_tokens: string[]
    ): string | undefined {
        if (in_from < in_tokens.length) {
            const child = this._childNodes[in_tokens[in_from]];
            const childPath = child
                ? child._generatePathFromTokensInternal(in_from + 1, in_tokens)
                : undefined;
            if (childPath !== undefined) {
                return "[" + in_tokens[in_from] + "]" + childPath;
            } else {
                return undefined;
            }
        } else {
            return "";
        }
    }

    /**
     * Internal function: insert the value into the tree using the tokenized path and calling itself recursively.
     *
     * Note: currently we assume that reference paths will *only* be inserted into the tree using this function and
     * not e.g. insertChild() !
     *
     * @param in_tokenizedPath - tokenized path to the value
     * @param in_pathDelimiters - token types for the path
     * @param in_position - where we are along the path
     * @param in_value - The value to insert into the tree
     * @returns The node that was created for the value
     */
    public _insert(
        in_tokenizedPath: (string | number)[],
        in_pathDelimiters: TOKEN_TYPES_TYPE[],
        in_position: number,
        in_value: any
    ): NodeType {
        let index = parseInt(in_tokenizedPath[in_position] as string, 10);
        //    console.log('_inserting at path: ' +
        //      concatTokenizedPath(in_tokenizedPath, in_pathDelimiters, in_position + 1) +
        //      ' index: ' + index + ' my length: ' + this._childNodes.length);
        if (isNaN(index) || index < 0 || index > this._childNodes.length) {
            throw new Error(
                "Invalid insertion index " +
                    in_tokenizedPath[in_position] +
                    ". Index should be in range [0, array.length]"
            );
        }
        let node: DataBindingTree;
        if (
            in_position === in_tokenizedPath.length - 1 ||
            typeof this._childNodes[index] === "undefined"
        ) {
            // If we're the last node in the path *or* we do not have a child with this index we need to
            // create the node, add it, and call its insert with the remainder of our path
            node = new DataBindingTree();
            if (index > this._childNodes.length) {
                // if we're inserting beyond the length of the array, it must be a reference path to a not yet existing array
                // index. In this case we have to insert "undefined" up to our desired index
                this._childNodes[index] = node;
            } else {
                this._childNodes.splice(index, 0, node);
            }
        }

        // we have to traverse further, defer to our children
        return this._childNodes[index]!._insert(
            in_tokenizedPath,
            in_pathDelimiters,
            in_position + 1,
            in_value
        );
    }

    /**
     * @param in_index - index
     * @param in_propertyContext - property context
     * @returns node
     * @package
     */
    insertChild(in_index: number, in_propertyContext: string): NodeType {
        let length =
            this._highestPathCallbackIndex > -1
                ? this._actualLength
                : this._childNodes.length;
        if (isNaN(in_index) || in_index < 0 || in_index > length) {
            throw new Error(
                "Invalid insertion index " +
                    in_index +
                    ". Index should be in range [0, " +
                    length +
                    "]"
            );
        }
        // If this array contains references we can only push at the end of the array (that is filled in so far) *or*
        // insert somewhere above the highest reference index
        if (
            this._highestPathCallbackIndex > -1 &&
            !(
                in_index === this._actualLength ||
                in_index > this._highestPathCallbackIndex
            )
        ) {
            throw new Error(
                "Cannot insert into an array that contains references below the index of the " +
                    "highest reference!"
            );
        }

        let node: NodeType = null;
        if (
            this._highestPathCallbackIndex > -1 &&
            this._highestPathCallbackIndex >= in_index
        ) {
            // we already have a "reference" node with a larger index
            // insert the already existing node if we have one instead of a new one or create one if we don't
            // but do not shift the rest of the array (if we get here we must be inserting at the emd of the array (that is
            // filled in so far) -- that is, only "reference" nodes (w/o a correspondig property node) have higher index
            // than us so it's ok
            if (this._childNodes[in_index]) {
                if (
                    this._childNodes[in_index] instanceof ArrayNode &&
                    in_propertyContext !== "array"
                ) {
                    this._convertFromSpecializedNode(this, in_index);
                }
                if (
                    !(this._childNodes[in_index] instanceof ArrayNode) &&
                    in_propertyContext === "array"
                ) {
                    // throw new Error('DataBindingTree encountered where it should not be, need to convert');
                    this._convertToArrayNode(this, in_index);
                }
                node = this._childNodes[in_index];
            } else {
                node =
                    DataBindingTree._createDataBindingTreeNodeForContext(
                        in_propertyContext
                    );
            }
            this._childNodes[in_index] = node;
            this._actualLength++;
        } else {
            // either this ArrayNode does not have any "reference" nodes or we're inserting an element beyond the reference
            // with the highest index, so just splice the children array as usual
            node =
                DataBindingTree._createDataBindingTreeNodeForContext(
                    in_propertyContext
                );
            this._childNodes.splice(in_index, 0, node);
            if (this._highestPathCallbackIndex > -1) {
                this._actualLength++;
            }
        }

        return node;
    }

    /**
     * Returns the tree node farthest along the given path.
     *
     * @param in_tokenizedPath - tokenized path to be removed
     * @param in_pathDelimiters - token types for the path
     * @param in_position - where we are along the path
     * @param in_parent - parent node (returned when we can't traverse further)
     *
     * @returns The node farthest along the path and the corresponding
     * (partial) path
     */
    _getClosestNode(
        in_tokenizedPath: (string | number)[],
        in_pathDelimiters: PATH_TOKENS_TYPE[],
        in_position: number,
        in_parent: DataBindingTree | ArrayNode
    ): any {
        let index = parseInt(in_tokenizedPath[in_position] as string, 10);
        if (
            isNaN(index) ||
            index < 0 ||
            index >= this._childNodes.length ||
            in_pathDelimiters[in_position] !==
                PathHelper.TOKEN_TYPES.ARRAY_TOKEN
        ) {
            // can't follow the path -> return the previous node and the path until that node
            return {
                path: concatTokenizedPath(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position - 1
                ),
                node: in_parent,
            };
        }
        return this._childNodes[index]!._getClosestNode(
            in_tokenizedPath,
            in_pathDelimiters,
            in_position + 1,
            this
        );
    }

    /**
     * Returns the node in the tree that is at the given path (if one exists).
     *
     * @param in_tokenizedPath - tokenized path to the node
     * @param in_position - where we are along the path
     * @param in_pathDelimiters - token types for the path
     * @param io_collectedNodes - (optional) collect nodes along the path in this array
     * @returns The node at the path if one exists, null otherwise.
     */
    _getNode(
        in_tokenizedPath: (string | number)[],
        in_position: number,
        in_pathDelimiters: TOKEN_TYPES_TYPE[],
        io_collectedNodes?: DataBindingTree[]
    ): NodeType {
        if (in_position === in_tokenizedPath.length) {
            return this;
        }

        let index = parseInt(in_tokenizedPath[in_position] as string, 10);
        if (
            isNaN(index) ||
            index < 0 ||
            index >= this._childNodes.length ||
            (in_pathDelimiters &&
                in_pathDelimiters[in_position] !==
                    PathHelper.TOKEN_TYPES.ARRAY_TOKEN)
        ) {
            return null;
        }
        return this._childNodes[index]!._getNode(
            in_tokenizedPath,
            in_position + 1,
            in_pathDelimiters,
            io_collectedNodes
        );
    }

    /**
     * Returns the tree node at the given path.
     *
     * @param path - The path to traverse. Must start with an index (E.g. [1].a.b.etc...)
     * @returns The node at the path if one exists. Otherwise, undefined.
     * @package
     */
    getNode(path: string): NodeType {
        let pathDelimiters = [];
        let tokenizedPath = _tokenizePath(path, pathDelimiters);
        return this._getNode(tokenizedPath, 0, pathDelimiters);
    }

    /**
     * Internal function: removes a sub tree using the tokenized path and calling itself recursively.
     *
     * @param in_tokenizedPath - tokenized path to be removed
     * @param in_pathDelimiters - token types for the path
     * @param in_position - where we are along the path
     * @returns The root of the subtree that was removed, or null
     */
    _remove(
        in_tokenizedPath: string[],
        in_pathDelimiters: TOKEN_TYPES_TYPE[],
        in_position: number
    ): NodeType {
        let index = parseInt(in_tokenizedPath[in_position], 10);
        if (index >= 0 && index < this._childNodes.length) {
            if (in_position === in_tokenizedPath.length - 1) {
                // we're at at the end of the path -> need to remove a direct child
                let node = this._childNodes[index];
                this._childNodes.splice(index, 1);
                return node;
            } else {
                // not yet the end of the path, need to continue with our child
                return this._childNodes[index]!._remove(
                    in_tokenizedPath,
                    in_pathDelimiters,
                    in_position + 1
                );
            }
        } else {
            // we can't go on with the path, return null and don't do anything
            return null;
        }
    }

    /**
     * Removes the subtree of a direct child
     *
     * @param in_index - the index of the child to remove
     * @returns The subtree that was removed. null if nothing was removed
     * @package
     */
    removeChild(in_index: number): NodeType {
        let length =
            this._highestPathCallbackIndex > -1
                ? this._actualLength
                : this._childNodes.length;
        //    console.log('array removal at: ' + in_index +
        //      ' length: ' + length + ' high: ' + this._highestPathCallbackIndex);
        if (isNaN(in_index) || in_index < 0 || in_index > length) {
            throw new Error(
                "Invalid removal index " +
                    in_index +
                    ". Index should be in range [0, " +
                    length +
                    "]"
            );
        }
        // If this array contains references we can only remove from the end of the array (that is filled in so far) *or*
        // remove from somewhere above the highest reference index
        if (
            this._highestPathCallbackIndex > -1 &&
            !(
                in_index === this._actualLength - 1 ||
                in_index > this._highestPathCallbackIndex
            )
        ) {
            throw new Error(
                "Cannot remove from an array that contains references below the index of the highest reference!"
            );
        }
        // TODO: we may potentially remove the child with the path callback that has the highest index and/or
        // TODO: the last child node that still has a path callback, will need to update array flags.
        let node = this._childNodes[in_index];
        if (
            this._highestPathCallbackIndex > -1 &&
            this._highestPathCallbackIndex >= in_index
        ) {
            // we have a removal at the end of our (potentially partially filled) array. Just set this child to undefined
            // and decrement our length
            console.assert(in_index === this._actualLength - 1);
            this._childNodes[in_index] = null;
            this._actualLength--;
        } else {
            // either this ArrayNode does not have any "reference" nodes or we're removing an element beyond the reference
            // with the highest index, so just splice the children array as usual
            this._childNodes.splice(in_index, 1);
            if (this._highestPathCallbackIndex > -1) {
                this._actualLength--;
            }
        }

        return node;
    }

    /**
     * Calls a function with each value stored in the tree.
     *
     * @param callback       - The function to call. Called with the value of each node.
     * @param postCallback - Function which is called after all child nodes have been processed
     * @param in_path - The path up to this node
     * @package
     */
    forEachChild(
        callback: Function,
        postCallback?: Function,
        in_path: (string | number)[] = []
    ) {
        callback(this._value, in_path, this);

        let i = 0;
        this._childNodes.forEach(function (node) {
            in_path.push(i++);
            node!.forEachChild(callback, postCallback, in_path);
            in_path.pop();
        });

        if (postCallback) {
            postCallback(this._value, in_path, this);
        }
    }

    /**
     * Returns a boolean indicating whether the node has children (i.e. is it a leaf node)
     *
     * @returns true if we have children
     * @package
     */
    hasChildren(): boolean {
        return this._childNodes.length !== 0;
    }

    /**
     * Returns an array of objects describing the children
     *
     * @returns The array of children
     * @package
     */
    getChildren(): any {
        return this._childNodes.map(function (child, index) {
            return {
                path: `[${index}]`,
                node: child,
            };
        });
    }

    /**
     * Collect all subtree paths from a node into a set
     *
     * @param in_currentPath - the path we've come so far
     * @param in_paths - the set into which we're collecting
     */
    _getSubtreePaths(in_currentPath: string, in_paths: Set<string>) {
        let keys = _.keys(this._childNodes);
        for (let i = 0; i < keys.length; i++) {
            // first collect the paths for our direct children
            in_paths.add(in_currentPath + "[" + keys[i] + "]");
            //  then recurse into our children
            this._childNodes[keys[i]]._getSubtreePaths(
                in_currentPath + "[" + keys[i] + "]",
                in_paths
            );
        }
    }

    /**
     * Returns the immediate child with the given name of this node
     *
     * @param in_child - the name of the child or an array of names
     * if an array is passed, the .getChild() function will be performed on each child in sequence
     * for example .get(['position','x']) is equivalent to .get('position').get('x')
     * @returns The specified child node (or null)
     * @package
     */
    getChild(in_child: string | string[]): NodeType {
        return DataBindingTree.prototype.getChild.call(this, in_child);
    }
}
