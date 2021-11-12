/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview The PropertyElement is a helper class that abstracts an element in the property set tree,
 * whether it is a specific property, or an element of a primitive collections (array/map). It allows code to be
 * written with less special cases when it comes to primitive collections.
 */
import { RESOLVE_NEVER, RESOLVE_ALWAYS } from './constants';

import { BaseProperty, REFERENCE_RESOLUTION_TYPE } from '@fluid-experimental/property-properties';
import { PathHelper, TypeIdHelper } from '@fluid-experimental/property-changeset';
import { isCollection, isReferenceProperty } from './typeGuards';

export declare type Property = BaseProperty | undefined;


// @TODO: Figure out the right types which has `getValues` method
function hasGetValues(property: Property): boolean {
    return (property as any).getValues && (property!.getTypeid() !== 'String' || isCollection(property));
}

export interface IOptions {
    /*
    * Define how should this function behave during reference resolution?
    */
    referenceResolutionMode?: REFERENCE_RESOLUTION_TYPE
}

let Options: IOptions = {
    referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS
}

/**
 * Currently not exposed to the world
 * @hidden
 */
export class PropertyElement {
    _property: Property;

    _childToken: string | number | undefined;

    /**
     * Currently not exposed to the world
     *
     * @param in_property -
     * @param in_childToken -
     * @hidden
     */
    constructor(in_property?: Property, in_childToken: string | number | undefined = undefined) {
        this._property = in_property;
        this._childToken = in_childToken;
    };

    /**
     * Return the current property. If getChildToken is defined, then we are actually inspecting an element
     * of this.getProperty(), which by definition must be a container.
     *
     * @returns the property the PropertyElement represents, or the container
     */
    getProperty(): BaseProperty | undefined {
        return this._property;
    };

    /**
     * Return the child token, in the case where the current property element is focused on an element
     * of a primitive container. If not defined, the property element represents this.getProperty().
     * If defined, the property element represents this.getProperty()[this.getChildToken()]
     *
     * @returns the token in the container this.getProperty(), or undefined if not a
     *   container element.
     */
    getChildToken(): string | number | undefined {
        return this._childToken;
    };

    /**
     * Returns true if the element is currently representing a value within a primitive collection, e.g.,
     * a string in an array of strings, a float in a map of floats...
     *
     * @returns true if the current element is part of a primitive collection.
     */
    isPrimitiveCollectionElement(): boolean {
        return this._childToken !== undefined;
    };

    /**
     * If this element is part of a primitive collection (e.g. a string in an array of strings), return the
     * context of the collection we are in (e.g., an array if a string in an array of strings)
     *
     * @returns the context of the parent container if this is a primitive collection element,
     *   undefined otherwise.
     */
    getPrimitiveCollectionContext(): string | undefined {
        if (this.isPrimitiveCollectionElement()) {
            return this._property!.getContext();
        } else {
            return undefined;
        }
    };

    /**
     * Return the value represented by this property element. If representing a property, it will return the
     * property value. If representing an element within a container, it will give that container element value.
     *
     * @returns the value of the property element represented.
     */
    getValue(): undefined | any {
        if (!this._property === undefined) {
            return undefined;
        } else if (this.isPrimitiveCollectionElement()) {
            // If it is a reference in a collection, we need to ensure to use getValue. .get() will
            // always resolve the reference.
            if (isReferenceProperty(this._property)) {
                /** @ts-ignore */
                return this._property.getValue(this._childToken);
            } else {
                return (this._property as any).get(this._childToken as any);
            }
        } else {
            if (hasGetValues(this._property)) {
                return (this._property as any).getValues();
            } else {
                /** @ts-ignore */
                return this._property.getValue();
            }
        }
    };

    /**
     * If representing a property, it will set the property value. If representing an element
     * within a container, it will set the container element value.
     *
     * @param value - the new value
     */
    setValue(value: any) {
        if (this._property !== undefined) {
            if (this.isPrimitiveCollectionElement()) {
                (this._property as any).set(this._childToken as never, value);
            } else {
                if (hasGetValues(this._property)) {
                    const workspace = this._property.getWorkspace();
                    if (workspace) {
                        // We wrap the setValues since it may do multiple ops. For example, setting an
                        // array will create a changeset for each individual element of the array.
                        workspace.pushNotificationDelayScope();
                        (this._property as any).setValues(value);
                        workspace.popNotificationDelayScope();
                    } else {
                        (this._property as any).setValues(value);
                    }
                } else {
                    /** @ts-ignore */
                    this._property.setValue(value);
                }
            }
        }
    };

    /**
     * Return the absolute path to this property element, including a container dereference if it
     * represents an element within a container
     *
     * @returns the path from the workspace root
     */
    getAbsolutePath(): string {
        let result = '';
        if (this._property) {
            result = this._property.getAbsolutePath();
            if (this.isPrimitiveCollectionElement()) {
                result += '[' + this._childToken + ']';
            }
        }
        return result;
    };

    /**
     * Return the tokenized path to this property element, including a container dereference if it
     * represents an element within a container.
     *
     * @returns the tokenized path from the workspace root
     */
    getTokenizedPath(): string[] {
        let result: string[] = [];
        if (this._property) {
            result = PathHelper.tokenizePathString(this.getAbsolutePath().substring(1));
        }
        return result;
    };

    /**
     * Return the typeid of this property element. If representing an element of a container, it will be the
     * container element type.
     *
     * @returns the id of this property element.
     */
    getTypeId(): string | undefined {
        if (!this._property) {
            return undefined;
        } else if (this.isPrimitiveCollectionElement()) {
            // In the case of a container, getTypeid is the type of the elements within a container
            return this._property.getTypeid();
        } else {
            return this._property.getFullTypeid();
        }
    };

    /**
     * Return the context of this property element. If representing an element of a container, it will be the
     * container element context.
     *
     * @returns the context
     */
    getContext(): string | undefined {
        if (!this._property) {
            return undefined;
        } else if (this.isPrimitiveCollectionElement()) {
            return 'single';
        } else {
            return this._property.getContext();
        }
    };

    /**
     * Get a console-friendly printout of the path represented by this property element.
     *
     * @returns the console-friendly printout
     */
    toString(): string {
        if (this._property) {
            return '<' + this.getAbsolutePath() + '>';
        } else {
            return '<invalid>';
        }
    };

    /**
     * Return whether this represents a valid property or element within a container property.
     *
     * @returns true if a valid property element
     */
    isValid(): boolean {
        return this._property !== undefined;
    };

    /**
     * Make the property element invalid
     */
    invalidate() {
        this._property = undefined;
        this._childToken = undefined;
    };

    /**
     * Return whether the element is a reference. Note, this means that if this property element represents an element
     * within a primitive array/map of references, this will return true.
     *
     * @returns true if the value represents a reference, false if invalid or not a reference.
     */
    isReference(): boolean {
        return this.isValid() ? TypeIdHelper.isReferenceTypeId(this.getTypeId()!) : false;
    };

    /**
     * Return whether the element represents a reference container.
     *
     * @returns true if the value represents a reference container, false if invalid or not a
     *  reference container.
     */
    isReferenceContainer(): boolean {
        const reference = this.isValid() ? TypeIdHelper.isReferenceTypeId(this._property!.getTypeid()) : false;
        const context = this.getContext();
        return reference && (context === 'map' || context === 'array' || context === 'set');
    };

    /**
     * Returns whether the property element is currently representing a primitive collection.
     *
     * @returns true if we are representing a primitive collection.
     */
    isPrimitiveCollection(): boolean {
        if (this._property && (this._property.getContext() === 'array' || this._property.getContext() === 'map')) {
            let entryTypeInfo = TypeIdHelper.extractContext(this._property.getFullTypeid());
            if (this.isPrimitiveCollectionElement()) {
                // Then the question is about the type of _property[_childToken], and not _property
                entryTypeInfo = TypeIdHelper.extractContext(entryTypeInfo.typeid);
            }
            if (entryTypeInfo.context === 'array' || entryTypeInfo.context === 'map') {
                return TypeIdHelper.isPrimitiveType(entryTypeInfo.typeid);
            }
        }
        return false;
    };

    /**
     * Get the child ids of the property represented by this element.
     *
     * @returns the ids of the children, or undefined if not a container
     */
    getChildIds(): string[] | undefined {
        if (!this.isValid() || this._childToken !== undefined || !(this._property as any).getIds) { //@TODO find a common type which has getIds
            return undefined;
        } else {
            return (this._property as any).getIds();
        }
    };

    /**
     * Return the child (token or tokenized path)
     *
     * @param in_child - the tokenized path, or single child
     * @param in_options - parameter object
     * @param in_tokensTypes - The types of tokens if in_child is tokenized path.
     * @returns the element representing the child. If it does not exist,
     *   this.isValid() will return false
     */
    getChild(in_child: string[] | string, in_options = Options, in_tokensTypes?: PathHelper.TOKEN_TYPES[]): PropertyElement {
        const result = new PropertyElement(this._property, this._childToken);
        result.becomeChild(in_child, in_options, in_tokensTypes);

        // We always return an element, it just may not be valid.
        return result;
    };

    /**
     * Become the child (token or tokenized path). If the child does not exist, then this.isValid() will
     * be false.
  *
     * @param in_child - the tokenized path, or single child
     * @param in_tokensTypes - The types of tokens if in_child is tokenized path.
     * @param in_options - parameter object
     * @returns Current property element
     */
    becomeChild(in_child: string[]|string, in_options = Options , in_tokensTypes: Array<PathHelper.TOKEN_TYPES> = []): PropertyElement {
        let child: string[]| string;
        if (!this.isValid()) {
            // If we're invalid, this isn't going to help
            return this;
        }

        let isPathString = false;
        if (typeof in_child === 'string') {
            isPathString = true;
            child = [in_child];
        } else if (typeof in_child === 'number') {
            child = [in_child];
        } else {
            child = in_child;
        }

        const resolutionMode = in_options.referenceResolutionMode;
        // Determine how to resolve references before the last one
        const isAlways = (resolutionMode === undefined || resolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS);
        const isNever = (resolutionMode === BaseProperty.REFERENCE_RESOLUTION.NEVER);

        // Determine how to resolve references up to the last one
        const innerResolve = isNever ? RESOLVE_NEVER : RESOLVE_ALWAYS;
        // Determine how to resolve reference at the last part of the path
        const lastResolve = isAlways ? RESOLVE_ALWAYS : RESOLVE_NEVER;

        for (let i = 0; i < child.length && this.isValid(); ++i) {
            const options = (i === child.length - 1) ? lastResolve : innerResolve;
            const token = child[i];
            const nextToken = child[i + 1]; // will be undefined at the last element

            if (i === 0 && (in_tokensTypes[i] === PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN) && token === '/') {
                this._property = this._property!.getRoot();
                this._childToken = undefined;
            } else if ((in_tokensTypes[i] === PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN) && token === '*') {
                if (nextToken !== undefined) {
                    this.invalidate();
                }
            } else if ((in_tokensTypes[i] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) && token === '../') {
                this.becomeParent();
            } else {
                if (this.isReference()) {
                    if (options === RESOLVE_NEVER) {
                        // Asking for a child, but at a reference and not allowed to dereference
                        this.invalidate();
                    } else {
                        this.becomeDereference();
                    }
                }
                const key = !isPathString ? token : PathHelper.unquotePathSegment(token);
                if (this._property !== undefined && (this._property as any).has(key)) {
                    if (this.isPrimitiveCollection()) {
                        if (this._childToken !== undefined) {
                            // We're currently representing an element of a string or number array, why
                            // are you asking for a child?
                            console.assert(!this.isReference());
                            this.invalidate();
                        } else if (this._property.getContext() === 'array') {
                            this._childToken = Number(key);
                        } else {
                            this._childToken = String(key);
                        }
                    } else {
                        // We pass RESOLVE_NEVER so that we just get the child, without following
                        // any references if the child is another reference.
                        // Below, we will decide whether to dereference
                        this._property = (this._property as any).get(key, RESOLVE_NEVER);
                    }
                    if (this._property && options === RESOLVE_ALWAYS && nextToken !== '*' && this.isReference()) {
                        this.becomeDereference();
                    }
                } else {
                    // Child not there (out of bound array, invalid map key, invalid Node property key...)
                    this.invalidate();
                }
            }
        }
        return this;
    };

    /**
     * Follow the reference represented by the current state of the element
     *
     * @param options - resolution options
     *
     * @returns Current property element
     */
    becomeDereference(options = Options): PropertyElement {
        if (this.isValid() && this._property !== undefined) {
            const path = (this._property as any).getValue(this._childToken); // correct even if childToken is undefined
            const out_pathDelimiters = [];
            const tokens = PathHelper.tokenizePathString(path, out_pathDelimiters);
            if (tokens.length) {
                if (this.isPrimitiveCollectionElement()) {
                    // References are relative to the property that contains it, which in this case is the container
                    // this primitive collection element belongs to.
                    this.becomeParent().becomeParent().becomeChild(tokens, options, out_pathDelimiters);
                } else {
                    this.becomeParent().becomeChild(tokens, options, out_pathDelimiters);
                }
            } else {
                this.invalidate();
            }
        }
        return this;
    };

    /**
     * Follow the reference represented by the current state of the element, and return a new PropertyElement
     *
     * @param options - resolution options
     *
     * @returns a new property element representing the dereferenced property
     */
    getDereference(options = Options): PropertyElement {
        return this.clone().becomeDereference(options);
    };

    /**
     * Get the parent.
     *
     * @returns a new property element representing the parent; may not be valid
     */
    getParent(): PropertyElement {
        const result = new PropertyElement(this._property, this._childToken);
        result.becomeParent();
        return result;
    };

    /**
     * Become the parent. If the parent does not exist, then this.isValid() will
     * be false.
     *
     * @returns The current property element
     */
    becomeParent(): PropertyElement {
        if (this._property) {
            if (this.isPrimitiveCollectionElement()) {
                this._childToken = undefined;
            } else {
                this._property = this._property.getParent()!;
                this._childToken = undefined;
            }
        }
        return this;
    };

    clone() {
        return new PropertyElement(this._property, this._childToken);
    };
};
