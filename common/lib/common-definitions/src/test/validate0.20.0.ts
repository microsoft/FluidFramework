/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as old from "@fluidframework/common-definitions-0.20.0";
import * as current from "../index";

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ExtendEventProvider": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_ExtendEventProvider():
    old.ExtendEventProvider<any,any,any>;
declare function use_current_TypeAliasDeclaration_ExtendEventProvider(
    use: current.ExtendEventProvider<any,any,any>);
use_current_TypeAliasDeclaration_ExtendEventProvider(
    get_old_TypeAliasDeclaration_ExtendEventProvider());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ExtendEventProvider": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_ExtendEventProvider():
    current.ExtendEventProvider<any,any,any>;
declare function use_old_TypeAliasDeclaration_ExtendEventProvider(
    use: old.ExtendEventProvider<any,any,any>);
use_old_TypeAliasDeclaration_ExtendEventProvider(
    get_current_TypeAliasDeclaration_ExtendEventProvider());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDisposable": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IDisposable():
    old.IDisposable;
declare function use_current_InterfaceDeclaration_IDisposable(
    use: current.IDisposable);
use_current_InterfaceDeclaration_IDisposable(
    get_old_InterfaceDeclaration_IDisposable());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDisposable": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IDisposable():
    current.IDisposable;
declare function use_old_InterfaceDeclaration_IDisposable(
    use: old.IDisposable);
use_old_InterfaceDeclaration_IDisposable(
    get_current_InterfaceDeclaration_IDisposable());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IErrorEvent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IErrorEvent():
    old.IErrorEvent;
declare function use_current_InterfaceDeclaration_IErrorEvent(
    use: current.IErrorEvent);
use_current_InterfaceDeclaration_IErrorEvent(
    get_old_InterfaceDeclaration_IErrorEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IErrorEvent": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IErrorEvent():
    current.IErrorEvent;
declare function use_old_InterfaceDeclaration_IErrorEvent(
    use: old.IErrorEvent);
use_old_InterfaceDeclaration_IErrorEvent(
    get_current_InterfaceDeclaration_IErrorEvent());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IEvent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IEvent():
    old.IEvent;
declare function use_current_InterfaceDeclaration_IEvent(
    use: current.IEvent);
use_current_InterfaceDeclaration_IEvent(
    get_old_InterfaceDeclaration_IEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IEvent": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IEvent():
    current.IEvent;
declare function use_old_InterfaceDeclaration_IEvent(
    use: old.IEvent);
use_old_InterfaceDeclaration_IEvent(
    get_current_InterfaceDeclaration_IEvent());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IEventProvider": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IEventProvider():
    old.IEventProvider<any>;
declare function use_current_InterfaceDeclaration_IEventProvider(
    use: current.IEventProvider<any>);
use_current_InterfaceDeclaration_IEventProvider(
    get_old_InterfaceDeclaration_IEventProvider());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IEventProvider": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IEventProvider():
    current.IEventProvider<any>;
declare function use_old_InterfaceDeclaration_IEventProvider(
    use: old.IEventProvider<any>);
use_old_InterfaceDeclaration_IEventProvider(
    get_current_InterfaceDeclaration_IEventProvider());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_IEventThisPlaceHolder": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_IEventThisPlaceHolder():
    old.IEventThisPlaceHolder;
declare function use_current_TypeAliasDeclaration_IEventThisPlaceHolder(
    use: current.IEventThisPlaceHolder);
use_current_TypeAliasDeclaration_IEventThisPlaceHolder(
    get_old_TypeAliasDeclaration_IEventThisPlaceHolder());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_IEventThisPlaceHolder": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_IEventThisPlaceHolder():
    current.IEventThisPlaceHolder;
declare function use_old_TypeAliasDeclaration_IEventThisPlaceHolder(
    use: old.IEventThisPlaceHolder);
use_old_TypeAliasDeclaration_IEventThisPlaceHolder(
    get_current_TypeAliasDeclaration_IEventThisPlaceHolder());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_IEventTransformer": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_IEventTransformer():
    old.IEventTransformer<any,any>;
declare function use_current_TypeAliasDeclaration_IEventTransformer(
    use: current.IEventTransformer<any,any>);
use_current_TypeAliasDeclaration_IEventTransformer(
    get_old_TypeAliasDeclaration_IEventTransformer());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_IEventTransformer": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_IEventTransformer():
    current.IEventTransformer<any,any>;
declare function use_old_TypeAliasDeclaration_IEventTransformer(
    use: old.IEventTransformer<any,any>);
use_old_TypeAliasDeclaration_IEventTransformer(
    get_current_TypeAliasDeclaration_IEventTransformer());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryBaseEvent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryBaseEvent():
    old.ITelemetryBaseEvent;
declare function use_current_InterfaceDeclaration_ITelemetryBaseEvent(
    use: current.ITelemetryBaseEvent);
use_current_InterfaceDeclaration_ITelemetryBaseEvent(
    get_old_InterfaceDeclaration_ITelemetryBaseEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryBaseEvent": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ITelemetryBaseEvent():
    current.ITelemetryBaseEvent;
declare function use_old_InterfaceDeclaration_ITelemetryBaseEvent(
    use: old.ITelemetryBaseEvent);
use_old_InterfaceDeclaration_ITelemetryBaseEvent(
    get_current_InterfaceDeclaration_ITelemetryBaseEvent());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryBaseLogger": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryBaseLogger():
    old.ITelemetryBaseLogger;
declare function use_current_InterfaceDeclaration_ITelemetryBaseLogger(
    use: current.ITelemetryBaseLogger);
use_current_InterfaceDeclaration_ITelemetryBaseLogger(
    get_old_InterfaceDeclaration_ITelemetryBaseLogger());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryBaseLogger": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITelemetryBaseLogger():
    current.ITelemetryBaseLogger;
declare function use_old_InterfaceDeclaration_ITelemetryBaseLogger(
    use: old.ITelemetryBaseLogger);
use_old_InterfaceDeclaration_ITelemetryBaseLogger(
    get_current_InterfaceDeclaration_ITelemetryBaseLogger());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryErrorEvent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryErrorEvent():
    old.ITelemetryErrorEvent;
declare function use_current_InterfaceDeclaration_ITelemetryErrorEvent(
    use: current.ITelemetryErrorEvent);
use_current_InterfaceDeclaration_ITelemetryErrorEvent(
    get_old_InterfaceDeclaration_ITelemetryErrorEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryErrorEvent": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ITelemetryErrorEvent():
    current.ITelemetryErrorEvent;
declare function use_old_InterfaceDeclaration_ITelemetryErrorEvent(
    use: old.ITelemetryErrorEvent);
use_old_InterfaceDeclaration_ITelemetryErrorEvent(
    get_current_InterfaceDeclaration_ITelemetryErrorEvent());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryGenericEvent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryGenericEvent():
    old.ITelemetryGenericEvent;
declare function use_current_InterfaceDeclaration_ITelemetryGenericEvent(
    use: current.ITelemetryGenericEvent);
use_current_InterfaceDeclaration_ITelemetryGenericEvent(
    get_old_InterfaceDeclaration_ITelemetryGenericEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryGenericEvent": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ITelemetryGenericEvent():
    current.ITelemetryGenericEvent;
declare function use_old_InterfaceDeclaration_ITelemetryGenericEvent(
    use: old.ITelemetryGenericEvent);
use_old_InterfaceDeclaration_ITelemetryGenericEvent(
    get_current_InterfaceDeclaration_ITelemetryGenericEvent());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryLogger": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryLogger():
    old.ITelemetryLogger;
declare function use_current_InterfaceDeclaration_ITelemetryLogger(
    use: current.ITelemetryLogger);
use_current_InterfaceDeclaration_ITelemetryLogger(
    get_old_InterfaceDeclaration_ITelemetryLogger());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryLogger": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITelemetryLogger():
    current.ITelemetryLogger;
declare function use_old_InterfaceDeclaration_ITelemetryLogger(
    use: old.ITelemetryLogger);
use_old_InterfaceDeclaration_ITelemetryLogger(
    get_current_InterfaceDeclaration_ITelemetryLogger());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryPerformanceEvent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryPerformanceEvent():
    old.ITelemetryPerformanceEvent;
declare function use_current_InterfaceDeclaration_ITelemetryPerformanceEvent(
    use: current.ITelemetryPerformanceEvent);
use_current_InterfaceDeclaration_ITelemetryPerformanceEvent(
    get_old_InterfaceDeclaration_ITelemetryPerformanceEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryPerformanceEvent": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ITelemetryPerformanceEvent():
    current.ITelemetryPerformanceEvent;
declare function use_old_InterfaceDeclaration_ITelemetryPerformanceEvent(
    use: old.ITelemetryPerformanceEvent);
use_old_InterfaceDeclaration_ITelemetryPerformanceEvent(
    get_current_InterfaceDeclaration_ITelemetryPerformanceEvent());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryProperties": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITelemetryProperties():
    old.ITelemetryProperties;
declare function use_current_InterfaceDeclaration_ITelemetryProperties(
    use: current.ITelemetryProperties);
use_current_InterfaceDeclaration_ITelemetryProperties(
    get_old_InterfaceDeclaration_ITelemetryProperties());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITelemetryProperties": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ITelemetryProperties():
    current.ITelemetryProperties;
declare function use_old_InterfaceDeclaration_ITelemetryProperties(
    use: old.ITelemetryProperties);
use_old_InterfaceDeclaration_ITelemetryProperties(
    get_current_InterfaceDeclaration_ITelemetryProperties());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ReplaceIEventThisPlaceHolder": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder():
    old.ReplaceIEventThisPlaceHolder<any,any>;
declare function use_current_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder(
    use: current.ReplaceIEventThisPlaceHolder<any,any>);
use_current_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder(
    get_old_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ReplaceIEventThisPlaceHolder": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder():
    current.ReplaceIEventThisPlaceHolder<any,any>;
declare function use_old_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder(
    use: old.ReplaceIEventThisPlaceHolder<any,any>);
use_old_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder(
    get_current_TypeAliasDeclaration_ReplaceIEventThisPlaceHolder());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_TelemetryEventCategory": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_TelemetryEventCategory():
    old.TelemetryEventCategory;
declare function use_current_TypeAliasDeclaration_TelemetryEventCategory(
    use: current.TelemetryEventCategory);
use_current_TypeAliasDeclaration_TelemetryEventCategory(
    get_old_TypeAliasDeclaration_TelemetryEventCategory());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_TelemetryEventCategory": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_TelemetryEventCategory():
    current.TelemetryEventCategory;
declare function use_old_TypeAliasDeclaration_TelemetryEventCategory(
    use: old.TelemetryEventCategory);
use_old_TypeAliasDeclaration_TelemetryEventCategory(
    get_current_TypeAliasDeclaration_TelemetryEventCategory());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_TelemetryEventPropertyType": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_TelemetryEventPropertyType():
    old.TelemetryEventPropertyType;
declare function use_current_TypeAliasDeclaration_TelemetryEventPropertyType(
    use: current.TelemetryEventPropertyType);
use_current_TypeAliasDeclaration_TelemetryEventPropertyType(
    get_old_TypeAliasDeclaration_TelemetryEventPropertyType());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_TelemetryEventPropertyType": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_TelemetryEventPropertyType():
    current.TelemetryEventPropertyType;
declare function use_old_TypeAliasDeclaration_TelemetryEventPropertyType(
    use: old.TelemetryEventPropertyType);
use_old_TypeAliasDeclaration_TelemetryEventPropertyType(
    get_current_TypeAliasDeclaration_TelemetryEventPropertyType());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_TransformedEvent": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_TransformedEvent():
    old.TransformedEvent<any,any,any>;
declare function use_current_TypeAliasDeclaration_TransformedEvent(
    use: current.TransformedEvent<any,any,any>);
use_current_TypeAliasDeclaration_TransformedEvent(
    get_old_TypeAliasDeclaration_TransformedEvent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_TransformedEvent": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_TransformedEvent():
    current.TransformedEvent<any,any,any>;
declare function use_old_TypeAliasDeclaration_TransformedEvent(
    use: old.TransformedEvent<any,any,any>);
use_old_TypeAliasDeclaration_TransformedEvent(
    get_current_TypeAliasDeclaration_TransformedEvent());
