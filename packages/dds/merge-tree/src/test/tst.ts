/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 export interface TSTResult<T> {
    key: string;
    val: T;
}

export interface TSTNode<T> {
    c: string;
    left?: TSTNode<T>;
    mid?: TSTNode<T>;
    right?: TSTNode<T>;
    val?: T;
}

interface TSTPrefix {
    text: string;
}

export interface ProxString<T> {
    text: string;
    invDistance: number;
    val: T;
}

export class TST<T> {
    private n = 0;
    private root: TSTNode<T> | undefined;

    public size() {
        return this.n;
    }

    private contains(key: string) {
        return this.get(key);
    }

    public get(key: string) {
        const x = this.nodeGet(this.root, key, 0);
        if (x === undefined) {
            return undefined;
        }
        return x.val;
    }

    private nodeGet(x: TSTNode<T> | undefined, key: string, d: number): TSTNode<T> | undefined {
        if (x === undefined) {
            return undefined;
        }
        const c = key.charAt(d);
        if (c < x.c) {
            return this.nodeGet(x.left, key, d);
        } else if (c > x.c) {
            return this.nodeGet(x.right, key, d);
        } else if (d < (key.length - 1)) {
            return this.nodeGet(x.mid, key, d + 1);
        } else { return x; }
    }

    public put(key: string, val: T) {
        if (!this.contains(key)) {
            this.n++;
        }
        this.root = this.nodePut(this.root, key, val, 0);
    }

    private nodePut(x: TSTNode<T> | undefined, key: string, val: T, d: number) {
        let _x = x;
        const c = key.charAt(d);
        if (_x === undefined) {
            _x = { c };
        }
        if (c < _x.c) {
            _x.left = this.nodePut(_x.left, key, val, d);
        } else if (c > _x.c) {
            _x.right = this.nodePut(_x.right, key, val, d);
        } else if (d < (key.length - 1)) {
            _x.mid = this.nodePut(_x.mid, key, val, d + 1);
        } else {
            _x.val = val;
        }
        return _x;
    }

    public neighbors(text: string, distance = 2) {
        let q: ProxString<T>[] = [];
        this.nodeProximity(this.root, { text: "" }, 0, text, distance, q);
        q = q.filter((value) => (value.text.length > 0));
        return q;
    }

    public keysWithPrefix(text: string) {
        const q: string[] = [];
        const x = this.nodeGet(this.root, text, 0);
        if (x === undefined) {
            return q;
        }
        if (x.val !== undefined) {
            q.push(text);
        }
        this.collect(x.mid, { text }, q);
        return q;
    }

    private collect(x: TSTNode<T> | undefined, prefix: TSTPrefix, q: string[]) {
        if (x === undefined) {
            return;
        }
        this.collect(x.left, prefix, q);
        if (x.val !== undefined) {
            q.push(prefix.text + x.c);
        }
        this.collect(x.mid, { text: prefix.text + x.c }, q);
        this.collect(x.right, prefix, q);
    }

    private mapNode(x: TSTNode<T> | undefined, prefix: TSTPrefix, fn: (key: string, val: T) => void) {
        if (x === undefined) {
            return;
        }
        const key = prefix.text + x.c;
        this.mapNode(x.left, prefix, fn);
        if (x.val) {
            fn(key, x.val);
        }
        this.mapNode(x.mid, { text: key }, fn);
        this.mapNode(x.right, prefix, fn);
    }

    public map(fn: (key: string, val: T) => void) {
        this.mapNode(this.root, { text: "" }, fn);
    }

    public pairsWithPrefix(text: string) {
        const q: TSTResult<T>[] = [];
        const x = this.nodeGet(this.root, text, 0);
        if (x === undefined) {
            return q;
        }
        if (x.val !== undefined) {
            q.push({ key: text, val: x.val });
        }
        this.collectPairs(x.mid, { text }, q);
        return q;
    }

    private collectPairs(x: TSTNode<T> | undefined, prefix: TSTPrefix, q: TSTResult<T>[]) {
        if (x === undefined) {
            return;
        }
        this.collectPairs(x.left, prefix, q);
        if (x.val !== undefined) {
            q.push({ key: prefix.text + x.c, val: x.val });
        }
        this.collectPairs(x.mid, { text: prefix.text + x.c }, q);
        this.collectPairs(x.right, prefix, q);
    }

    private nodeProximity(
        x: TSTNode<T> | undefined,
        prefix: TSTPrefix,
        d: number,
        pattern: string,
        distance: number,
        q: ProxString<T>[]) {
        if ((x === undefined) || (distance < 0)) {
            return;
        }
        const c = pattern.charAt(d);
        if ((distance > 0) || (c < x.c)) {
            this.nodeProximity(x.left, prefix, d, pattern, distance, q);
        }
        if (x.val !== undefined) {
            const remD = distance - (pattern.length - d);
            if (remD >= 0) {
                let invD = distance;
                if (c !== x.c) {
                    invD--;
                }
                q.push({ text: prefix.text + x.c, val: x.val, invDistance: invD });
            }
        }
        const recurD = (d < (pattern.length - 1)) ? d + 1 : d;
        if (c === x.c) {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance, q);
        } else {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance - 1, q);
        }
        if ((distance > 0) || (c > x.c)) {
            this.nodeProximity(x.right, prefix, d, pattern, distance, q);
        }
    }
}
