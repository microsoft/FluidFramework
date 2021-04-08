import { ValueArrayProperty, ValueMapProperty, ValueProperty, ArrayProperty, BaseProperty,MapProperty,ReferenceProperty,  ContainerProperty, ReferenceMapProperty, ReferenceArrayProperty, SetProperty } from '@fluid-experimental/property-properties';

export abstract class ProxifiedPropertyValueArray  {
  public abstract getProperty(): ValueArrayProperty;
  public swap(index0: number, index1: number);
}
export abstract class ProxifiedArrayProperty  extends Array {
  public abstract getProperty(): ArrayProperty;
  public swap(index0: number, index1: number);
}
export class BaseProxifiedProperty {
  getProperty(input?: any): BaseProperty;
}

export abstract class ProxifiedSetProperty  extends Set { public abstract getProperty(): BaseProperty; }
export abstract class ProxifiedMapProperty  extends Map { public abstract getProperty(): MapProperty; }
export type ProxifiedPropertyCollection =
  ProxifiedArrayProperty | ProxifiedSetProperty | ProxifiedSetProperty;
export const proxySymbol: symbol | string;

type GenericProxify<TProperty> = {
  [P in keyof TProperty]: ProxyType<TProperty[P]>;
}

type ProxyType<TProperty> =
  TProperty extends ContainerProperty ? (BaseProxifiedProperty & {[key: string]: any}) :
  TProperty extends ValueProperty ? number | boolean | string | object :
  TProperty extends ValueArrayProperty ? (ProxifiedPropertyValueArray & (number[] | boolean[] | string[] | object[])) :
  TProperty extends ValueMapProperty ? (BaseProxifiedProperty & (Map<string, number | boolean | string | object>)) :
  TProperty extends MapProperty ? ProxifiedMapProperty :
  TProperty extends ArrayProperty ? ProxifiedArrayProperty :
  TProperty extends SetProperty ? ProxifiedSetProperty :
  GenericProxify<TProperty>;

export class PropertyProxy {
  static getParentOfReferencedProperty(property:
    ReferenceProperty | ReferenceMapProperty | ReferenceArrayProperty, key?: string);
  static proxify(property: ValueArrayProperty): ProxyType<ValueArrayProperty>;
  static proxify(property: ValueMapProperty): ProxyType<ValueMapProperty>;
  static proxify(property: ArrayProperty): ProxyType<ArrayProperty>;
  static proxify(property: MapProperty): ProxyType<MapProperty>;
  static proxify(property: SetProperty): ProxyType<SetProperty>;
  static proxify(property: ContainerProperty): ProxyType<ContainerProperty>;
  static proxify(property: ValueProperty): ProxyType<ValueProperty>;
  static proxify<TProperty>(property: BaseProperty): ProxyType<TProperty>
}
