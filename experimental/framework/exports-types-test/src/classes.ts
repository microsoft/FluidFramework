/**
 * A public class.
 *
 * @public
 */
export class PublicClass {
	constructor() {}

	/**
	 * A protected property.
	 *
	 * @public
	 */
	protected protectedAlphaProperty: boolean = true;

	/**
	 * A public method
	 *
	 * @public
	 */
	public publicMethod(): boolean {
		return true;
	}

	/**
	 * A beta method
	 *
	 * @beta
	 */
	public betaMethod(): boolean {
		return true;
	}

	/**
	 * An alpha method
	 *
	 * @alpha
	 */
	public alphaMethod(): boolean {
		return true;
	}
}

/**
 * @public
 */
export abstract class AbstractBaseClass {
	constructor() {}

	/**
	 * A protected property.
	 *
	 * @public
	 */
	protected protectedProperty: boolean = true;

	/**
	 * @beta
	 */
	abstract abstractProperty: boolean;
}
