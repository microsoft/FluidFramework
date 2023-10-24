import {
	PublicInterface,
	PublicClass,
	AbstractBaseClass,
} from "@fluid-experimental/exports-types-test";
import { AlphaInterface } from "@fluid-experimental/exports-types-test/alpha";
import {
	BetaInterface,
	PublicClass as BetaClass,
	AbstractBaseClass as BetaAbstractBaseClass,
} from "@fluid-experimental/exports-types-test/beta";

const pubClass = new PublicClass();
let _ = pubClass.publicMethod();

// _ = bar.betaMethod(); // Won't compile because betaMethod is not found

const betaClass = new BetaClass();
_ = betaClass.betaMethod(); // Compiles

class SubClass extends PublicClass {
	protected protectedProperty: boolean = false;
}

export class ImplClass extends AbstractBaseClass {
	/*
  This compiles, but if we import AbstractBaseClass from /beta instead, we'll get an error:

  exports-types-test-beta.d.ts(15, 14): Non-abstract class 'ImplClass' does not implement inherited abstract member
  'abstractProperty' from class 'AbstractBaseClass'.

  We have to implement the abstract member, as we do in the example below.
  */
}

export class Impl2Class extends BetaAbstractBaseClass {
	abstractProperty: boolean = true;
}

class Foo implements PublicInterface {
	publicMethod(): boolean {
		return true;
	}
}

class Foo2 implements BetaInterface {
	betaMethod(): boolean {
		return true;
	}
}

class Foo3 implements AlphaInterface {
	alphaMethod(): boolean {
		return true;
	}
}
