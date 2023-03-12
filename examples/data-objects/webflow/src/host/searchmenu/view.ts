/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface IListenerRegistration {
	target: EventTarget;
	type: string;
	listener: EventListener;
}

export interface IView<TInit, TProps> {
	attach(parent: Element, init: Readonly<TInit>): void;
	update(props: Readonly<TProps>): void;
	detach(): void;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export abstract class View<TInit extends TProps, TProps = {} | undefined>
	implements IView<TInit, TProps>
{
	private _root?: Element;
	private listeners?: IListenerRegistration[];

	public attach(parent: Element, init: Readonly<TInit>) {
		this._root = this.onAttach(init);
		this.onUpdate(init);
		console.assert(parent.hasChildNodes() === false);
		parent.append(this._root);
	}

	public update(props: Readonly<TProps>) {
		this.onUpdate(props);
	}

	public detach() {
		const { root: root, listeners } = this;

		const parent = root.parentNode;
		root.remove();

		console.assert(parent.hasChildNodes() === false);

		if (listeners !== undefined) {
			for (const { target, type, listener } of listeners) {
				target.removeEventListener(type, listener);
			}
		}

		this.onDetach();

		this._root = undefined;
		this.listeners = undefined;
	}

	protected get root() {
		return this._root;
	}
	protected abstract onAttach(init: Readonly<TInit>): Element;
	protected abstract onUpdate(props: Readonly<TProps>): void;
	protected abstract onDetach(): void;

	protected onDom<K extends keyof HTMLElementEventMap>(
		target: EventTarget,
		type: K | string,
		listener: (ev: HTMLElementEventMap[K]) => any,
	) {
		const eventListener = listener as EventListener;
		const registration: IListenerRegistration = { target, type, listener: eventListener };
		const listeners = this.listeners;

		if (listeners === undefined) {
			this.listeners = [registration];
		} else {
			listeners.push(registration);
		}

		target.addEventListener(type, eventListener);
	}
}
