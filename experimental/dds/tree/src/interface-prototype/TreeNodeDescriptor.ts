import { Serializable } from '@fluidframework/datastore-definitions';
import { NodeId } from '../Identifiers';
import { StableId } from './Anchors';
import { DetachedRange } from './TreeAnchors';

export type TreeDescriptor = TreeNodeDescriptor | number | boolean | string | Int8Array | Uint8Array | BigUint64Array; // TODO: other array types
type RangeDescriptor = Iterable<TreeDescriptor>;
export type TraitDescriptor = TreeDescriptor | RangeDescriptor | DetachedRange;

export const discriminator = Symbol();
export const specifiedIdentity = Symbol();
export const value = Symbol();

type Discriminator = StableId & { readonly Discriminator: '2ff39b9b-e962-4f57-9333-1ebfc7d4c631' };

export interface TreeNodeDescriptor {
	[discriminator]?: Discriminator; // This field is mutually exclusive with specifiedIdentity
	[specifiedIdentity]?: NodeId; // ...this field (which is for advanced users only, so not TreeNode’s [identity])
	[value]?: Serializable;
	[key: string]: TraitDescriptor;
}
