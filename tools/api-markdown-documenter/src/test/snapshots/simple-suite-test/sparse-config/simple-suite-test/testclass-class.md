# TestClass

Test class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass 
```
<b>Extends:</b> [TestAbstractClass](docs/simple-suite-test/testabstractclass-class)

<b>Type parameters:</b> 

* <b>TTypeParameterA</b>: A type parameter


* <b>TTypeParameterB</b>: Another type parameter


## Remarks {#testclass-remarks}

Here are some remarks about the class

## Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testclass-testclasseventproperty-property) | <code>readonly</code> | () =&gt; void | Test class event property |

## Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/simple-suite-test/testclass-_constructor_-constructor) | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](docs/simple-suite-test/testclass-abstractpropertygetter-property) | <code>readonly</code> | [TestMappedType](docs/simple-suite-test/testmappedtype-typealias) | A test abstract getter property. |
|  [testClassGetterProperty](docs/simple-suite-test/testclass-testclassgetterproperty-property) | <code>readonly</code> | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test/testclass-testclassproperty-property) | <code>readonly</code> | TTypeParameterB | Test class property |
|  [testClassStaticProperty](docs/simple-suite-test/testclass-testclassstaticproperty-property) | <code>static</code> | (foo: number) =&gt; string | Test static class property |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](docs/simple-suite-test/testclass-publicabstractmethod-method) |  | void | A test public abstract method. |
|  [testClassMethod(input)](docs/simple-suite-test/testclass-testclassmethod-method) |  | TTypeParameterA | Test class method |
|  [testClassStaticMethod(foo)](docs/simple-suite-test/testclass-testclassstaticmethod-method) | <code>static</code> | string | Test class static method |
|  [virtualMethod()](docs/simple-suite-test/testclass-virtualmethod-method) |  | number | Overrides [TestAbstractClass.virtualMethod()](docs/simple-suite-test/testabstractclass-virtualmethod-method)<!-- -->. |