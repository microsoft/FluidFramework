/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal React element type compatible with React 18 and React 19.
 * @alpha @sealed
 */
export interface ReactElement {
	/**
	 * The component or intrinsic element type.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches the corresponding React property.
	readonly type: any;
	/**
	 * The element's props.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches the corresponding React property.
	readonly props: any;
	/**
	 * The element's reconciliation key, if one was provided.
	 */
	// eslint-disable-next-line @rushstack/no-new-null -- Matches the corresponding React property.
	readonly key: string | null;
}

/**
 * Minimal React function component type compatible with React 18 and React 19.
 * @typeParam P - The component's props.
 * @alpha
 */
export type FC<in P = object> = (props: P) => ReactElement;

/**
 * Comparator for the props of a memoized component.
 * @typeParam P - The component's props.
 * @alpha @sealed
 */
export type PropsAreEqual<P> = (previous: Readonly<P>, next: Readonly<P>) => boolean;

/**
 * Minimal memoized component type compatible with React 18 and React 19.
 * @typeParam T - The component being memoized.
 * @alpha @sealed
 */
export type MemoExoticComponent<T extends FC<never>> = FC<Parameters<T>[0]>;
