/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BspSet,
    empty,
    dense,
    Empty,
    Dense,
    combineCmp,
    SetOperations,
    intersectUntyped,
    compareUntyped,
    Cachable,
    UntypedBspSet,
    unionUntyped,
    exceptUntyped,
    lazy,
    UntypedSparse,
    fromUntyped,
    meetsUntyped,
    Pair,
} from "./bspSet";

type Restrict<T, Props extends (keyof T)[]> = { [Prop in Props[number]]: T[Prop] };

export type Product<T> = { readonly [dim in keyof T]: T[dim] extends BspSet<infer _TKey, infer _TId> ? T[dim] : never };

type UntypedProduct<T> = {
    readonly [dim in keyof T]?: T[dim] extends BspSet<infer TKey, infer _TId> ? UntypedSparse<TKey> : never;
};

type Probabilities<T> = { readonly [dim in keyof T]?: number };

type ProductOperations<T> = {
    readonly [dim in keyof T]: T[dim] extends BspSet<infer TKey, infer TId> ? SetOperations<TKey, TId> : never;
};

/** Given a cartesian product, a subspace is a subset of said space, such that it is also a cartesian product
 * and all the dimensions form subsets of the original cartesian product.
 *
 * This is a generalized notion of something like hyper-rectangles. Examples include:
 * - Rectangles
 * - Individual cells in a grid
 * - Rectangular ranges with missing rows and/or columns
 *
 * For the actual definition and properties, please read the document about *Operations on Cartesian Products*.
 */
interface Subspace<T> {
    readonly isSubspace: true;
    // isCoSubspace: boolean;
    readonly bounds: UntypedProduct<T>;
}

// type CoSubspace<T> = {
//   isSubspace: boolean;
//   isCoSubspace: true;
//   subspace: Product<T>;
// };

interface Union<T> {
    readonly isSubspace: false;
    // readonly isCoSubspace: false;
    readonly left: UntypedSparseProduct<T>;
    readonly right: UntypedSparseProduct<T>;
    readonly bounds: UntypedProduct<T>;
    readonly subspaceCount: number;
}

type UntypedSparseProduct<T> = Subspace<T> | Union<T>; // | CoSubspace<T>;

interface SparseProduct<T> {
    readonly productOperations: ProductOperations<T>;
    readonly root: UntypedSparseProduct<T>;
}

interface Box<T> {
    box: UntypedProduct<T>;
    probabilities: Probabilities<T>;
    children?: Pair<Box<T>>;
    depth: number;
}

const tops: { [poKey in string]?: Box<unknown> } = {};
const top = <T>(productOperations: ProductOperations<T>): Box<T> => {
    const dims: [keyof T, ProductOperations<T>[keyof T]["id"]][] = [];
    for (const dimStr of Object.keys(productOperations)) {
        const dim = dimStr as keyof T;
        dims.push([dim, productOperations[dim].id]);
    }

    const poKey = JSON.stringify(dims.sort());
    let currTop = tops[poKey];
    if (currTop === undefined) {
        currTop = { box: {}, probabilities: {}, depth: 1 };
        tops[poKey] = currTop;
    }

    return currTop;
};

function subspace<T>(bounds: UntypedProduct<T>): Subspace<T> | Dense {
    let isDense = true;
    for (const dim of Object.keys(bounds)) {
        if (Object.prototype.hasOwnProperty.call(bounds, dim)) {
            isDense = false;
            break;
        }
    }
    if (isDense) {
        return dense;
    }
    return { isSubspace: true as const, bounds };
}

function getUntypedSubspaceCount<T>(set: UntypedSparseProduct<T>) {
    if (set.isSubspace) {
        return 1;
    }
    return set.subspaceCount;
}

const union = <T>(
    left: UntypedSparseProduct<T>,
    right: UntypedSparseProduct<T>,
    bounds: UntypedProduct<T>,
): Union<T> => ({
    isSubspace: false as const,
    left,
    right,
    bounds,
    subspaceCount: getUntypedSubspaceCount(left) + getUntypedSubspaceCount(right),
});

function sparseProduct<T>(
    productOperations: ProductOperations<T>,
    root: UntypedSparseProduct<T> | Dense,
): SparseProduct<T> | Dense {
    if (root === dense) {
        return root;
    }
    if (root.isSubspace) {
        let hasSparseDimensions = false;
        for (const dim of Object.keys(root.bounds)) {
            if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
                hasSparseDimensions = true;
                break;
            }
        }
        if (!hasSparseDimensions) {
            return dense;
        }
    }
    return { productOperations, root };
}

type UntypedProductSet<T> = Empty | Dense | UntypedSparseProduct<T>;
export type ProductSet<T> = Empty | Dense | SparseProduct<T>;

function toBspSet<T>(set: UntypedBspSet<T> | undefined) {
    if (set === undefined) {
        return dense;
    }
    return set;
}

/** An object that contains all downcasts. The operations in here are generally of the kind that need dynamic
 * features, i.e. iterate over the object properties somehow. Their *usage* can be considered safe, but they warrant
 * more careful review whenever a change occurs, because we get less support from the type system and we are
 * downcasting. */
const unsafe = {
    unzip<T>(product: Product<T>): ProductSet<T> {
        const productOperations: { [dim in keyof T]?: SetOperations<unknown, unknown> } = {};
        const root: { [dim in keyof T]?: UntypedSparse<unknown> } = {};
        for (const dimStr of Object.keys(product)) {
            const dim = dimStr as keyof T;
            if (Object.prototype.hasOwnProperty.call(product, dim)) {
                const set: BspSet<unknown, unknown> = product[dim];
                if (set === empty) {
                    return empty;
                }
                if (set === dense) {
                    continue;
                }

                productOperations[dim] = set.setOperations;
                root[dim] = set.root;
            }
        }

        return sparseProduct(productOperations as ProductOperations<T>, subspace(root as UntypedProduct<T>));
    },

    combineProduct<T>(
        productOperations: ProductOperations<T>,
        left: UntypedProduct<T>,
        right: UntypedProduct<T>,
        combineFunc: <Key extends Cachable<Key>, Id>(
            setOperations: SetOperations<Key, Id>,
            left: UntypedBspSet<Key>,
            right: UntypedBspSet<Key>
        ) => UntypedBspSet<Key>,
    ) {
        const res: { [dim in keyof T]?: UntypedSparse<unknown> } = {};
        for (const dimStr of Object.keys(productOperations)) {
            const dim = dimStr as keyof T;
            if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
                const combined = combineFunc<unknown, unknown>(
                    productOperations[dim],
                    toBspSet(left[dim]),
                    toBspSet(right[dim]),
                );
                if (combined === empty) {
                    return combined;
                }
                if (combined === dense) {
                    continue;
                }
                res[dim] = combined;
            }
        }

        return res as UntypedProduct<T>;
    },

    // eslint-disable-next-line @typescript-eslint/ban-types
    restrict<T extends object, Props extends (keyof T)[]>(object: T, ...props: Props) {
        const res: Partial<Restrict<T, Props>> = {};
        for (const key of props) {
            if (Object.prototype.hasOwnProperty.call(object, key)) {
                const prop = object[key];
                res[key] = prop;
            }
        }

        return res as Restrict<T, Props>;
    },

    fromUntypedProduct<T, Props extends (keyof T)[]>(
        productOperations: ProductOperations<Restrict<T, Props>>,
        bounds: UntypedProduct<Restrict<T, Props>>,
        dims: Props,
    ) {
        const product: { [dim in Props[number]]?: BspSet<unknown, unknown> } = {};
        for (const dim of dims) {
            const bound: UntypedSparse<unknown> | undefined = bounds[dim];
            product[dim] = fromUntyped(productOperations[dim], bound !== undefined ? bound : dense);
        }
        return product as Product<Restrict<T, Props>>;
    },

    denseProduct<T, Props extends (keyof T)[]>(dims: Props): Product<Restrict<T, Props>> {
        const top_inner: { [dim in Props[number]]?: Dense } = {};
        for (const dim of dims) {
            top_inner[dim] = dense;
        }
        return top_inner as Product<Restrict<T, Props>>;
    },
};

export const createFromProduct = unsafe.unzip.bind(unsafe);

type Compatible<T, U> = { [dim in keyof T & keyof U]: T[dim] };

function joinBounds<T>(productOperations: ProductOperations<T>, left: UntypedProduct<T>, right: UntypedProduct<T>) {
    const join = unsafe.combineProduct(productOperations, left, right, unionUntyped);
    if (join === empty) {
        throw new Error("broken invariant: the union of two non-empty products cannot be empty");
    }

    return join;
}

function compareSubspace<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProduct<T>,
    right: UntypedProduct<T>,
) {
    let cmp: ReturnType<typeof combineCmp> = 0;
    for (const dimStr of Object.keys(productOperations)) {
        const dim = dimStr as keyof T;
        if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
            const lProj = toBspSet(left[dim]);
            const rProj = toBspSet(right[dim]);
            const setOperations = productOperations[dim];

            cmp = combineCmp(cmp, compareUntyped<unknown, unknown>(setOperations, lProj, rProj));

            if (cmp === undefined) {
                return undefined;
            }
        }
    }

    return cmp;
}

const tryUnionSubspaces = (() => {
    const cache: { left?: unknown; right?: unknown; res?: unknown; } = {};
    return <T>(
        productOperations: ProductOperations<T>,
        left: Subspace<T>,
        right: Subspace<T>,
    ): Subspace<T> | Dense | Empty | undefined => {
        if (left === cache.left && right === cache.right) {
            return cache.res as ReturnType<typeof tryUnionSubspaces>;
        }
        cache.left = left;
        cache.right = right;

        const cmp = compareSubspace(productOperations, left.bounds, right.bounds);
        if (cmp !== undefined) {
            return (cache.res = cmp <= 0 ? right : left);
        }
        let differentDimension: keyof T | undefined;

        // because Object.keys only returns string[], we need to downcast
        const po_keys = Object.keys(productOperations) as (keyof T)[];
        for (const dim of po_keys) {
            if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
                const cmp_inner = compareUntyped<unknown, unknown>(
                    productOperations[dim],
                    toBspSet(left.bounds[dim]),
                    toBspSet(right.bounds[dim]),
                );
                if (cmp_inner !== 0) {
                    if (differentDimension !== undefined) {
                        return (cache.res = undefined);
                    }

                    differentDimension = dim;
                }
            }
        }

        if (differentDimension !== undefined) {
            const newDim = unionUntyped<unknown, unknown>(
                productOperations[differentDimension],
                toBspSet(left.bounds[differentDimension]),
                toBspSet(right.bounds[differentDimension]),
            );
            if (newDim === empty) {
                return (cache.res = empty);
            }
            if (newDim === dense) {
                // we are actually deleting the `differentDimension`, so the variable
                // `deleted` must be there. Hence disabling the rule here.
                const { [differentDimension]: deleted, ...leftBoundsWithoutDifferentDimension } = left.bounds;
                return (cache.res = subspace<unknown>(leftBoundsWithoutDifferentDimension));
            }

            const newBounds: UntypedProduct<T> = {
                ...left.bounds,
                [differentDimension]: newDim,
            };
            return (cache.res = subspace(newBounds));
        }

        return (cache.res = undefined);
    };
})();

function combineChildren<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
): UntypedProductSet<T> {
    if (right === empty) {
        return left;
    }
    if (right === dense) {
        return right;
    }
    if (left === empty) {
        return right;
    }
    if (left === dense) {
        return left;
    }

    if (!left.isSubspace || !right.isSubspace) {
        return union<T>(left, right, joinBounds(productOperations, left.bounds, right.bounds));
    }

    const combinedSubspace = tryUnionSubspaces<T>(productOperations, left, right);

    if (combinedSubspace !== undefined) {
        return combinedSubspace;
    }
    return union(left, right, joinBounds(productOperations, left.bounds, right.bounds));
}

function projectUntyped<T, Props extends (keyof T)[]>(
    productOperations: ProductOperations<T>,
    set: UntypedSparseProduct<T>,
    ...dims: Props
): UntypedProductSet<Restrict<T, Props>> {
    const bounds = unsafe.restrict(set.bounds, ...dims);
    if (set.isSubspace) {
        return subspace(bounds);
    }

    const lChild = projectUntyped(productOperations, set.left, ...dims);
    if (lChild === dense) {
        return dense;
    }
    const rChild = projectUntyped(productOperations, set.right, ...dims);
    return combineChildren(productOperations, lChild, rChild);
}

export function project<T, Props extends (keyof T)[]>(
    set: ProductSet<T>,
    ...dims: Props
): ProductSet<Restrict<T, Props>> {
    if (set === dense || set === empty) {
        return set;
    }
    const productOperations = unsafe.restrict(set.productOperations, ...dims);
    const root = projectUntyped(productOperations, set.root, ...dims);
    if (root === empty) {
        return root;
    }
    return sparseProduct(productOperations, root);
}

function splitBox<T>(productOperations: ProductOperations<T>, currentBox: Box<T>): Pair<Box<T>> {
    if (currentBox.children !== undefined) { return currentBox.children; }
    const { box, probabilities } = currentBox;
    let biggestDim: keyof T | undefined;
    let biggestDimKey;
    let currentProb = 0;
    // because Object.keys only returns string[], we need to downcast
    const po_keys = Object.keys(productOperations) as (keyof T)[];
    for (const dim of po_keys) {
        if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
            const prob: number | undefined = probabilities[dim];
            const setOperations_inner = productOperations[dim];
            if (prob === undefined) {
                biggestDim = dim;
                biggestDimKey = setOperations_inner.top;
                break;
            }

            if (prob > currentProb) {
                const dimensionSet = toBspSet(box[dim]);
                if (dimensionSet === empty) {
                    throw new Error("the key split can never return empty");
                }
                let key = setOperations_inner.top;
                if (dimensionSet !== dense) {
                    if (!dimensionSet.isExact) {
                        throw new Error("the key can always be represented exactly");
                    }

                    key = dimensionSet.key;
                }
                if (!setOperations_inner.canSplit(key)) {
                    continue;
                }
                biggestDim = dim;
                currentProb = prob;
                biggestDimKey = key;
            }
        }
    }

    if (biggestDim === undefined || biggestDimKey === undefined) {
        throw new Error("there has to be at least one dimension");
    }

    const setOperations = productOperations[biggestDim];

    const [[leftDim, leftProb], [rightDim, rightProb]] = setOperations.split(biggestDimKey);
    const res: ReturnType<typeof splitBox> = [
        {
            box: { ...box, [biggestDim]: lazy<unknown, unknown>(setOperations, setOperations.top, leftDim) },
            probabilities: { ...probabilities, [biggestDim]: leftProb },
            depth: currentBox.depth + 1,
        },
        {
            box: { ...box, [biggestDim]: lazy<unknown, unknown>(setOperations, setOperations.top, rightDim) },
            probabilities: { ...probabilities, [biggestDim]: rightProb },
            depth: currentBox.depth + 1,
        },
    ];
    if (currentBox.depth < 10) {
        currentBox.children = res;
    }
    return res;
}

function restrictByBounds<T>(
    productOperations: ProductOperations<T>,
    set: UntypedProductSet<T>,
    leftBounds: UntypedProduct<T>,
    rightBounds: UntypedProduct<T>,
): Pair<UntypedProductSet<T>> {
    if (set === empty) {
        return [empty, empty];
    }
    if (set === dense) {
        return [subspace(leftBounds), subspace(rightBounds)];
    }
    const cmp = compareSubspace(productOperations, set.bounds, leftBounds);

    // the set is fully contained in the left half, i.e. we know the pair.
    if (cmp !== undefined && cmp <= 0) {
        return [set, empty];
    }

    const newLeftBounds = unsafe.combineProduct(productOperations, set.bounds, leftBounds, intersectUntyped);

    // if we know, that the left set is completely empty, then the whole set is in the right bounds.
    if (newLeftBounds === empty) {
        return [empty, set];
    }

    const newRightBounds = unsafe.combineProduct(productOperations, set.bounds, rightBounds, intersectUntyped);
    if (set.isSubspace) {
        return [subspace(newLeftBounds), newRightBounds === empty ? empty : subspace(newRightBounds)];
    }

    const [ll, lr] = restrictByBounds(productOperations, set.left, leftBounds, rightBounds);
    const [rl, rr] = restrictByBounds(productOperations, set.right, leftBounds, rightBounds);
    return [combineChildren(productOperations, ll, rl), combineChildren(productOperations, lr, rr)];
}

const splitByBox = <T>(
    productOperations: ProductOperations<T>,
    set: UntypedProductSet<T>,
    { box: leftBounds }: Box<T>,
    { box: rightBounds }: Box<T>,
): Pair<UntypedProductSet<T>, UntypedProductSet<T>> => {
    return restrictByBounds(productOperations, set, leftBounds, rightBounds);
};

function recurse<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
    currentBox: Box<T>,
    visitFunc: (
        productOperations: ProductOperations<T>,
        left: UntypedProductSet<T>,
        right: UntypedProductSet<T>,
        box: Box<T>
    ) => UntypedProductSet<T>,
) {
    const [leftBox, rightBox] = splitBox(productOperations, currentBox);
    const [ll, lr] = splitByBox(productOperations, left, leftBox, rightBox);
    const [rl, rr] = splitByBox(productOperations, right, leftBox, rightBox);

    const lChild = visitFunc(productOperations, ll, rl, leftBox);
    if (lChild === dense) {
        return dense;
    }
    const rChild = visitFunc(productOperations, lr, rr, rightBox);
    return combineChildren(productOperations, lChild, rChild);
}

function unionUntypedProduct<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
    currentBox: Box<T>,
): UntypedProductSet<T> {
    if (right === empty) {
        return left;
    }
    if (left === empty) {
        return right;
    }
    if (left === dense) {
        return left;
    }
    if (right === dense) {
        return right;
    }
    if (left.isSubspace && right.isSubspace) {
        const combinedSubspace = tryUnionSubspaces(productOperations, left, right);
        if (combinedSubspace !== undefined) {
            return combinedSubspace;
        }
    }

    return recurse(productOperations, left, right, currentBox, unionUntypedProduct);
}

export function unionProduct<T extends Compatible<U, T>, U extends Compatible<T, U>>(
    left: ProductSet<T>,
    right: ProductSet<U>,
): ProductSet<T & U> {
    if (right === empty) {
        return left;
    }
    if (right === dense) {
        return right;
    }
    if (left === empty) {
        return right;
    }
    if (left === dense) {
        return left;
    }
    const productOperations = { ...left.productOperations, ...right.productOperations };
    const res = unionUntypedProduct(productOperations, left.root, right.root, top(productOperations));
    if (res === empty) {
        return res;
    }
    return sparseProduct(productOperations, res);
}

function intersectUntypedProduct<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
    currentBox: Box<T>,
): UntypedProductSet<T> {
    if (left === empty || right === empty) {
        return empty;
    }
    if (left === dense) {
        return right;
    }
    if (right === dense) {
        return left;
    }
    if (left.isSubspace && right.isSubspace) {
        const res = unsafe.combineProduct(productOperations, left.bounds, right.bounds, intersectUntyped);
        if (res === empty) {
            return empty;
        }
        return subspace(res);
    }

    return recurse(productOperations, left, right, currentBox, intersectUntypedProduct);
}

export function intersectProduct<T extends Compatible<U, T>, U extends Compatible<T, U>>(
    left: ProductSet<T>,
    right: ProductSet<U>,
): ProductSet<T & U> {
    if (left === empty) {
        return left;
    }
    if (right === empty) {
        return right;
    }
    if (left === dense) {
        return right;
    }
    if (right === dense) {
        return left;
    }

    const productOperations = { ...left.productOperations, ...right.productOperations };
    const res = intersectUntypedProduct(productOperations, left.root, right.root, top(productOperations));
    if (res === empty) {
        return res;
    }
    return sparseProduct(productOperations, res);
}

function tryExceptSubspaces<T>(
    productOperations: ProductOperations<T>,
    left: Subspace<T>,
    right: Subspace<T>,
): Subspace<T> | Dense | Empty | undefined {
    const cmp = compareSubspace(productOperations, left.bounds, right.bounds);
    if (cmp === 0 || cmp === -1) {
        return empty;
    }
    let notContainedDimension: keyof T | undefined;
    // because Object.keys only returns string[], we need to downcast
    const po_keys = Object.keys(productOperations) as (keyof T)[];
    for (const dim of po_keys) {
        if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
            const cmp_inner = compareUntyped<unknown, unknown>(
                productOperations[dim],
                toBspSet(left.bounds[dim]),
                toBspSet(right.bounds[dim]),
            );
            if (cmp_inner === undefined || cmp_inner > 0) {
                if (notContainedDimension !== undefined) {
                    return undefined;
                }

                notContainedDimension = dim;
            }
        }
    }

    if (notContainedDimension !== undefined) {
        const newDim = exceptUntyped<unknown, unknown>(
            productOperations[notContainedDimension],
            toBspSet(left.bounds[notContainedDimension]),
            toBspSet(right.bounds[notContainedDimension]),
        );

        if (newDim === empty) {
            return empty;
        }
        if (newDim === dense) {
            // we are actually deleting the `differentDimension`, so the variable
            // `deleted` must be there. Hence disabling the rule here.
            const { [notContainedDimension]: deleted, ...leftBoundsWithoutDifferentDimension } = left.bounds;
            return subspace<unknown>(leftBoundsWithoutDifferentDimension);
        }
        const newBounds: UntypedProduct<T> = {
            ...left.bounds,
            [notContainedDimension]: newDim,
        };
        return subspace(newBounds);
    }

    return undefined;
}

function exceptUntypedProduct<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
    currentBox: Box<T>,
): UntypedProductSet<T> {
    if (left === empty) {
        return left;
    }
    if (right === dense) {
        return empty;
    }
    if (right === empty) {
        return left;
    }

    if (left === dense) {
        return recurse(productOperations, left, right, currentBox, exceptUntypedProduct);
    }

    if (left.isSubspace && right.isSubspace) {
        const combinedSubspace = tryExceptSubspaces(productOperations, left, right);
        if (combinedSubspace !== undefined) {
            return combinedSubspace;
        }
    }

    return recurse(productOperations, left, right, currentBox, exceptUntypedProduct);
}

export function exceptProduct<T extends Compatible<U, T>, U extends Compatible<T, U>>(
    left: ProductSet<T>,
    right: ProductSet<U>,
): ProductSet<T & U> {
    if (left === empty) {
        return left;
    }
    if (right === empty) {
        return left;
    }
    if (right === dense) {
        return empty;
    }
    if (left === dense) {
        const res_inner =
            exceptUntypedProduct(right.productOperations, dense, right.root, top(right.productOperations));
        if (res_inner === empty) {
            return res_inner;
        }
        return sparseProduct(right.productOperations, res_inner);
    }

    const productOperations = { ...left.productOperations, ...right.productOperations };
    const res = exceptUntypedProduct(productOperations, left.root, right.root, top(productOperations));
    if (res === empty) {
        return res;
    }
    return sparseProduct(productOperations, res);
}

function compareUntypedProduct<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
    boundingBox: Box<T>,
): -1 | 0 | 1 | undefined {
    if (left === right) {
        return 0;
    }

    if (left === empty) {
        return -1;
    }

    if (right === empty) {
        return 1;
    }

    if (left === dense) {
        if (right === dense) {
            return 0;
        }

        return 1;
    }

    if (right === dense) {
        return -1;
    }

    if (left.isSubspace) {
        if (right.isSubspace) {
            return compareSubspace(productOperations, left.bounds, right.bounds);
        }
    }

    const [leftBox, rightBox] = splitBox(productOperations, boundingBox);
    const [ll, lr] = splitByBox(productOperations, left, leftBox, rightBox);
    const [rl, rr] = splitByBox(productOperations, right, leftBox, rightBox);

    const leftCmp = compareUntypedProduct(productOperations, ll, rl, leftBox);
    if (leftCmp === undefined) {
        return undefined;
    }
    return combineCmp(leftCmp, compareUntypedProduct(productOperations, lr, rr, rightBox));
}

export function compareProduct<T extends Compatible<U, T>, U extends Compatible<T, U>>(
    left: ProductSet<T>,
    right: ProductSet<U>,
) {
    if (left === right) {
        return 0;
    }

    if (left === empty) {
        return -1;
    }

    if (right === empty) {
        return 1;
    }

    if (left === dense) {
        if (right === dense) {
            return 0;
        }

        return 1;
    }

    if (right === dense) {
        return -1;
    }

    const productOperations = { ...left.productOperations, ...right.productOperations };
    return compareUntypedProduct(productOperations, left.root, right.root, top(productOperations));
}

function meetsSubspace<T>(productOperations: ProductOperations<T>, left: UntypedProduct<T>, right: UntypedProduct<T>) {
    for (const dimStr of Object.keys(productOperations)) {
        const dim = dimStr as keyof T;
        if (Object.prototype.hasOwnProperty.call(productOperations, dim)) {
            const lProj = toBspSet(left[dim]);
            const rProj = toBspSet(right[dim]);
            const setOperations = productOperations[dim];
            if (!meetsUntyped<unknown, unknown>(setOperations, lProj, rProj)) {
                return false;
            }
        }
    }

    return true;
}

function meetsUntypedProduct<T>(
    productOperations: ProductOperations<T>,
    left: UntypedProductSet<T>,
    right: UntypedProductSet<T>,
    boundingBox: Box<T>,
): boolean {
    if (left === empty || right === empty) {
        return false;
    }
    if (left === dense || right === dense) {
        return true;
    }
    if (!meetsSubspace(productOperations, left.bounds, right.bounds)) {
        return false;
    }
    if (left.isSubspace && right.isSubspace) {
        return true;
    }

    const [leftBox, rightBox] = splitBox(productOperations, boundingBox);
    const [ll, lr] = splitByBox(productOperations, left, leftBox, rightBox);
    const [rl, rr] = splitByBox(productOperations, right, leftBox, rightBox);

    return (
        meetsUntypedProduct(productOperations, ll, rl, leftBox)
        || meetsUntypedProduct(productOperations, lr, rr, rightBox)
    );
}

export function meetsProduct<T extends Compatible<U, T>, U extends Compatible<T, U>>(
    left: ProductSet<T>,
    right: ProductSet<U>,
) {
    if (left === empty || right === empty) {
        return false;
    }
    if (left === dense || right === dense) {
        return true;
    }

    const productOperations = { ...left.productOperations, ...right.productOperations };
    return meetsUntypedProduct(productOperations, left.root, right.root, top(productOperations));
}

export const complementProduct = <T>(set: ProductSet<T>) => exceptProduct(dense, set);

export const symmetricDiffProduct = <T>(left: ProductSet<T>, right: ProductSet<T>) =>
    unionProduct(exceptProduct(left, right), exceptProduct(right, left));

export function getSubspaces<T>(set: ProductSet<T>) {
    if (set === empty || set === dense) {
        return [];
    }
    const res: UntypedProduct<T>[] = [];
    function loop(root: UntypedSparseProduct<T>) {
        if (root.isSubspace) {
            res.push(root.bounds);
            return;
        }

        loop(root.left);
        loop(root.right);
    }

    loop(set.root);
    return res;
}

export function forEachProduct<T, Props extends (keyof T)[]>(
    set: ProductSet<T>,
    f: (product: Product<Restrict<T, Props>>) => boolean,
    ...dims: Props
): boolean {
    const newSet = project(set, ...dims);
    if (newSet === empty) {
        return true;
    }
    if (newSet === dense) {
        return f(unsafe.denseProduct(dims));
    }

    const { productOperations, root } = newSet;

    function loop(root_inner: UntypedSparseProduct<T>): boolean {
        if (root_inner.isSubspace) {
            return f(unsafe.fromUntypedProduct(productOperations, root_inner.bounds, dims));
        }
        return loop(root_inner.left) && loop(root_inner.right);
    }

    return loop(root);
}

export function getSubspaceCount<T>(set: ProductSet<T>) {
    if (set === empty || set === dense) {
        return 0;
    }
    return getUntypedSubspaceCount(set.root);
}
