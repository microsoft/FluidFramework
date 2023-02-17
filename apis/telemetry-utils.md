{
  "title": "@fluidframework/telemetry-utils Package",
  "kind": "Package",
  "members": {
    "Class": {
      "BaseTelemetryNullLogger": "/docs/apis/telemetry-utils\\basetelemetrynulllogger-class",
      "ChildLogger": "/docs/apis/telemetry-utils\\childlogger-class",
      "DebugLogger": "/docs/apis/telemetry-utils\\debuglogger-class",
      "EventEmitterWithErrorHandling": "/docs/apis/telemetry-utils\\eventemitterwitherrorhandling-class",
      "LoggingError": "/docs/apis/telemetry-utils\\loggingerror-class",
      "MockLogger": "/docs/apis/telemetry-utils\\mocklogger-class",
      "MultiSinkLogger": "/docs/apis/telemetry-utils\\multisinklogger-class",
      "PerformanceEvent": "/docs/apis/telemetry-utils\\performanceevent-class",
      "SampledTelemetryHelper": "/docs/apis/telemetry-utils\\sampledtelemetryhelper-class",
      "TaggedLoggerAdapter": "/docs/apis/telemetry-utils\\taggedloggeradapter-class",
      "TelemetryLogger": "/docs/apis/telemetry-utils\\telemetrylogger-class",
      "TelemetryNullLogger": "/docs/apis/telemetry-utils\\telemetrynulllogger-class",
      "TelemetryUTLogger": "/docs/apis/telemetry-utils\\telemetryutlogger-class",
      "ThresholdCounter": "/docs/apis/telemetry-utils\\thresholdcounter-class"
    },
    "TypeAlias": {
      "ConfigTypes": "/docs/apis/telemetry-utils#configtypes-typealias",
      "TelemetryEventPropertyTypeExt": "/docs/apis/telemetry-utils#telemetryeventpropertytypeext-typealias",
      "TelemetryEventPropertyTypes": "/docs/apis/telemetry-utils#telemetryeventpropertytypes-typealias"
    },
    "Variable": {
      "connectedEventName": "/docs/apis/telemetry-utils#connectedeventname-variable",
      "disconnectedEventName": "/docs/apis/telemetry-utils#disconnectedeventname-variable",
      "getCircularReplacer": "/docs/apis/telemetry-utils#getcircularreplacer-variable",
      "hasErrorInstanceId": "/docs/apis/telemetry-utils#haserrorinstanceid-variable",
      "isILoggingError": "/docs/apis/telemetry-utils#isiloggingerror-variable",
      "NORMALIZED_ERROR_TYPE": "/docs/apis/telemetry-utils#normalized_error_type-variable",
      "sessionStorageConfigProvider": "/docs/apis/telemetry-utils#sessionstorageconfigprovider-variable"
    },
    "Function": {
      "extractLogSafeErrorProperties": "/docs/apis/telemetry-utils#extractlogsafeerrorproperties-function",
      "generateErrorWithStack": "/docs/apis/telemetry-utils#generateerrorwithstack-function",
      "generateStack": "/docs/apis/telemetry-utils#generatestack-function",
      "isExternalError": "/docs/apis/telemetry-utils#isexternalerror-function",
      "isFluidError": "/docs/apis/telemetry-utils#isfluiderror-function",
      "isTaggedTelemetryPropertyValue": "/docs/apis/telemetry-utils#istaggedtelemetrypropertyvalue-function",
      "isValidLegacyError": "/docs/apis/telemetry-utils#isvalidlegacyerror-function",
      "loggerToMonitoringContext": "/docs/apis/telemetry-utils#loggertomonitoringcontext-function",
      "logIfFalse": "/docs/apis/telemetry-utils#logiffalse-function",
      "mixinMonitoringContext": "/docs/apis/telemetry-utils#mixinmonitoringcontext-function",
      "normalizeError": "/docs/apis/telemetry-utils#normalizeerror-function",
      "raiseConnectedEvent": "/docs/apis/telemetry-utils#raiseconnectedevent-function",
      "safeRaiseEvent": "/docs/apis/telemetry-utils#saferaiseevent-function",
      "wrapError": "/docs/apis/telemetry-utils#wraperror-function",
      "wrapErrorAndLog": "/docs/apis/telemetry-utils#wraperrorandlog-function"
    },
    "Interface": {
      "IConfigProvider": "/docs/apis/telemetry-utils\\iconfigprovider-interface",
      "IConfigProviderBase": "/docs/apis/telemetry-utils\\iconfigproviderbase-interface",
      "IFluidErrorAnnotations": "/docs/apis/telemetry-utils\\ifluiderrorannotations-interface",
      "IFluidErrorBase": "/docs/apis/telemetry-utils\\ifluiderrorbase-interface",
      "IPerformanceEventMarkers": "/docs/apis/telemetry-utils\\iperformanceeventmarkers-interface",
      "ITaggedTelemetryPropertyTypeExt": "/docs/apis/telemetry-utils\\itaggedtelemetrypropertytypeext-interface",
      "ITelemetryErrorEventExt": "/docs/apis/telemetry-utils\\itelemetryerroreventext-interface",
      "ITelemetryEventExt": "/docs/apis/telemetry-utils\\itelemetryeventext-interface",
      "ITelemetryGenericEventExt": "/docs/apis/telemetry-utils\\itelemetrygenericeventext-interface",
      "ITelemetryLoggerExt": "/docs/apis/telemetry-utils\\itelemetryloggerext-interface",
      "ITelemetryLoggerPropertyBag": "/docs/apis/telemetry-utils\\itelemetryloggerpropertybag-interface",
      "ITelemetryLoggerPropertyBags": "/docs/apis/telemetry-utils\\itelemetryloggerpropertybags-interface",
      "ITelemetryPerformanceEventExt": "/docs/apis/telemetry-utils\\itelemetryperformanceeventext-interface",
      "ITelemetryPropertiesExt": "/docs/apis/telemetry-utils\\itelemetrypropertiesext-interface",
      "MonitoringContext": "/docs/apis/telemetry-utils\\monitoringcontext-interface"
    },
    "Enum": {
      "TelemetryDataTag": "/docs/apis/telemetry-utils#telemetrydatatag-enum"
    }
  },
  "package": "@fluidframework/telemetry-utils",
  "unscopedPackageName": "telemetry-utils"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/telemetry-utils](/docs/apis/telemetry-utils)

## Interfaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Interface
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\iconfigprovider-interface'>IConfigProvider</a>
      </td>
      <td>
        Explicitly typed interface for reading configurations
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\iconfigproviderbase-interface'>IConfigProviderBase</a>
      </td>
      <td>
        Base interface for providing configurations to enable/disable/control features
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\ifluiderrorannotations-interface'>IFluidErrorAnnotations</a>
      </td>
      <td>
        Metadata to annotate an error object when annotating or normalizing it
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\ifluiderrorbase-interface'>IFluidErrorBase</a>
      </td>
      <td>
        All normalized errors flowing through the Fluid Framework adhere to this readonly interface. It features errorType and errorInstanceId on top of Error's members as readonly, and a getter/setter for telemetry props to be included when the error is logged.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\iperformanceeventmarkers-interface'>IPerformanceEventMarkers</a>
      </td>
      <td>
        Describes what events PerformanceEvent should log By default, all events are logged, but client can override this behavior For example, there is rarely a need to record start event, as we really after success / failure tracking, including duration (on success).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itaggedtelemetrypropertytypeext-interface'>ITaggedTelemetryPropertyTypeExt</a>
      </td>
      <td>
        A property to be logged to telemetry containing both the value and a tag. Tags are generic strings that can be used to mark pieces of information that should be organized or handled differently by loggers in various first or third party scenarios. For example, tags are used to mark personal information that should not be stored in logs.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetryerroreventext-interface'>ITelemetryErrorEventExt</a>
      </td>
      <td>
        Error telemetry event. Maps to category = "error"
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetryeventext-interface'>ITelemetryEventExt</a>
      </td>
      <td>
        Interface for logging telemetry statements. Can contain any number of properties that get serialized as json payload.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetrygenericeventext-interface'>ITelemetryGenericEventExt</a>
      </td>
      <td>
        Informational (non-error) telemetry event Maps to category = "generic"
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetryloggerext-interface'>ITelemetryLoggerExt</a>
      </td>
      <td>
        An extended TelemetryLogger interface which allows for more lenient event types. This interface is meant to be used internally within the Fluid Framework, and ITelemetryBaseLogger should be used when loggers are passed between layers.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetryloggerpropertybag-interface'>ITelemetryLoggerPropertyBag</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetryloggerpropertybags-interface'>ITelemetryLoggerPropertyBags</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetryperformanceeventext-interface'>ITelemetryPerformanceEventExt</a>
      </td>
      <td>
        Performance telemetry event. Maps to category = "performance"
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\itelemetrypropertiesext-interface'>ITelemetryPropertiesExt</a>
      </td>
      <td>
        JSON-serializable properties, which will be logged with telemetry.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\monitoringcontext-interface'>MonitoringContext</a>
      </td>
      <td>
        A type containing both a telemetry logger and a configuration provider
      </td>
    </tr>
  </tbody>
</table>

## Classes

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Class
      </th>
      <th scope="col">
        Alerts
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\basetelemetrynulllogger-class'>BaseTelemetryNullLogger</a>
      </td>
      <td>
      </td>
      <td>
        Null logger It can be used in places where logger instance is required, but events should be not send over.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\childlogger-class'>ChildLogger</a>
      </td>
      <td>
      </td>
      <td>
        ChildLogger class contains various helper telemetry methods, encoding in one place schemas for various types of Fluid telemetry events. Creates sub-logger that appends properties to all events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\debuglogger-class'>DebugLogger</a>
      </td>
      <td>
      </td>
      <td>
        Implementation of debug logger
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\eventemitterwitherrorhandling-class'>EventEmitterWithErrorHandling</a>
      </td>
      <td>
      </td>
      <td>
        Event Emitter helper class Any exceptions thrown by listeners will be caught and raised through "error" event. Any exception thrown by "error" listeners will propagate to the caller.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\loggingerror-class'>LoggingError</a>
      </td>
      <td>
      </td>
      <td>
        <p>Base class for "trusted" errors we create, whose properties can generally be logged to telemetry safely. All properties set on the object, or passed in (via the constructor or addTelemetryProperties), will be logged in accordance with their tag, if present.</p><p>PLEASE take care to avoid setting sensitive data on this object without proper tagging!</p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\mocklogger-class'>MockLogger</a>
      </td>
      <td>
      </td>
      <td>
        The MockLogger records events sent to it, and then can walk back over those events searching for a set of expected events to match against the logged events.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\multisinklogger-class'>MultiSinkLogger</a>
      </td>
      <td>
      </td>
      <td>
        Multi-sink logger Takes multiple ITelemetryBaseLogger objects (sinks) and logs all events into each sink Implements ITelemetryBaseLogger (through static create() method)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\performanceevent-class'>PerformanceEvent</a>
      </td>
      <td>
      </td>
      <td>
        Helper class to log performance events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\sampledtelemetryhelper-class'>SampledTelemetryHelper</a>
      </td>
      <td>
      </td>
      <td>
        Helper class that executes a specified code block and writes an <a href='/docs/apis/common-definitions\itelemetryperformanceevent-interface'>ITelemetryPerformanceEvent</a> to a specified logger every time a specified number of executions is reached (or when the class is disposed). The <code>duration</code> field in the telemetry event is the duration of the latest execution (sample) of the specified function. See the documentation of the <code>includeAggregateMetrics</code> parameter for additional details that can be included.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\taggedloggeradapter-class'>TaggedLoggerAdapter</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\telemetrylogger-class'>TelemetryLogger</a>
      </td>
      <td>
      </td>
      <td>
        TelemetryLogger class contains various helper telemetry methods, encoding in one place schemas for various types of Fluid telemetry events. Creates sub-logger that appends properties to all events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\telemetrynulllogger-class'>TelemetryNullLogger</a>
      </td>
      <td>
      </td>
      <td>
        Null logger It can be used in places where logger instance is required, but events should be not send over.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\telemetryutlogger-class'>TelemetryUTLogger</a>
      </td>
      <td>
      </td>
      <td>
        Logger that is useful for UT It can be used in places where logger instance is required, but events should be not send over.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils\thresholdcounter-class'>ThresholdCounter</a>
      </td>
      <td>
      </td>
      <td>
        Utility counter which will send event only if the provided value is above a configured threshold
      </td>
    </tr>
  </tbody>
</table>

## Enumerations

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Enum
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#telemetrydatatag-enum'>TelemetryDataTag</a>
      </td>
      <td>
        Broad classifications to be applied to individual properties as they're prepared to be logged to telemetry. Please do not modify existing entries for backwards compatibility.
      </td>
    </tr>
  </tbody>
</table>

## Types

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        TypeAlias
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#configtypes-typealias'>ConfigTypes</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#telemetryeventpropertytypeext-typealias'>TelemetryEventPropertyTypeExt</a>
      </td>
      <td>
        Property types that can be logged. Includes extra types beyond TelemetryEventPropertyType (which will be deprecated in favor of this one)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#telemetryeventpropertytypes-typealias'>TelemetryEventPropertyTypes</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Functions

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Function
      </th>
      <th scope="col">
        Return Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#extractlogsafeerrorproperties-function'>extractLogSafeErrorProperties</a>
      </td>
      <td>
        { message: string; errorType?: string | undefined; stack?: string | undefined; }
      </td>
      <td>
        Inspect the given error for common "safe" props and return them
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#generateerrorwithstack-function'>generateErrorWithStack</a>
      </td>
      <td>
        Error
      </td>
      <td>
        The purpose of this function is to provide ability to capture stack context quickly. Accessing new Error().stack is slow, and the slowest part is accessing stack property itself. There are scenarios where we generate error with stack, but error is handled in most cases and stack property is not accessed. For such cases it's better to not read stack property right away, but rather delay it until / if it's needed Some browsers will populate stack right away, others require throwing Error, so we do auto-detection on the fly.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#generatestack-function'>generateStack</a>
      </td>
      <td>
        string | undefined
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#isexternalerror-function'>isExternalError</a>
      </td>
      <td>
        boolean
      </td>
      <td>
        True for any error object that is an (optionally normalized) external error False for any error we created and raised within the FF codebase via LoggingError base class, or wrapped in a well-known error type
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#isfluiderror-function'>isFluidError</a>
      </td>
      <td>
        e is <a href='/docs/apis/telemetry-utils\ifluiderrorbase-interface'>IFluidErrorBase</a>
      </td>
      <td>
        type guard for IFluidErrorBase interface
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#istaggedtelemetrypropertyvalue-function'>isTaggedTelemetryPropertyValue</a>
      </td>
      <td>
        x is <a href='/docs/apis/common-definitions\itaggedtelemetrypropertytype-interface'>ITaggedTelemetryPropertyType</a> | <a href='/docs/apis/telemetry-utils\itaggedtelemetrypropertytypeext-interface'>ITaggedTelemetryPropertyTypeExt</a>
      </td>
      <td>
        Type guard to identify if a particular telemetry property appears to be a tagged telemetry property
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#isvalidlegacyerror-function'>isValidLegacyError</a>
      </td>
      <td>
        e is Omit<<a href='/docs/apis/telemetry-utils\ifluiderrorbase-interface'>IFluidErrorBase</a>, "errorInstanceId">
      </td>
      <td>
        type guard for old standard of valid/known errors
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#loggertomonitoringcontext-function'>loggerToMonitoringContext</a>
      </td>
      <td>
        <a href='/docs/apis/telemetry-utils\monitoringcontext-interface'>MonitoringContext</a><L>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#logiffalse-function'>logIfFalse</a>
      </td>
      <td>
        condition is true
      </td>
      <td>
        Like assert, but logs only if the condition is false, rather than throwing
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#mixinmonitoringcontext-function'>mixinMonitoringContext</a>
      </td>
      <td>
        <a href='/docs/apis/telemetry-utils\monitoringcontext-interface'>MonitoringContext</a><L>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#normalizeerror-function'>normalizeError</a>
      </td>
      <td>
        <a href='/docs/apis/telemetry-utils\ifluiderrorbase-interface'>IFluidErrorBase</a>
      </td>
      <td>
        Normalize the given error yielding a valid Fluid Error
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#raiseconnectedevent-function'>raiseConnectedEvent</a>
      </td>
      <td>
        void
      </td>
      <td>
        Raises events pertaining to the connection
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#saferaiseevent-function'>safeRaiseEvent</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#wraperror-function'>wrapError</a>
      </td>
      <td>
        T
      </td>
      <td>
        Create a new error using newErrorFn, wrapping and caused by the given unknown error. Copies the inner error's stack, errorInstanceId and telemetry props over to the new error if present
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#wraperrorandlog-function'>wrapErrorAndLog</a>
      </td>
      <td>
        T
      </td>
      <td>
        The same as wrapError, but also logs the innerError, including the wrapping error's instance id
      </td>
    </tr>
  </tbody>
</table>

## Variables

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Variable
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#connectedeventname-variable'>connectedEventName</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#disconnectedeventname-variable'>disconnectedEventName</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#getcircularreplacer-variable'>getCircularReplacer</a>
      </td>
      <td>
        Borrowed from <a href='https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples'>https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples</a> Avoids runtime errors with circular references. Not ideal, as will cut values that are not necessarily circular references. Could be improved by implementing Node's util.inspect() for browser (minus all the coloring code)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#haserrorinstanceid-variable'>hasErrorInstanceId</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#isiloggingerror-variable'>isILoggingError</a>
      </td>
      <td>
        type guard for ILoggingError interface
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#normalized_error_type-variable'>NORMALIZED_ERROR_TYPE</a>
      </td>
      <td>
        The Error class used when normalizing an external error
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#sessionstorageconfigprovider-variable'>sessionStorageConfigProvider</a>
      </td>
      <td>
        Creates a base configuration provider based on <code>sessionStorage</code>
      </td>
    </tr>
  </tbody>
</table>

## Enumeration Details

### TelemetryDataTag {#telemetrydatatag-enum}

Broad classifications to be applied to individual properties as they're prepared to be logged to telemetry. Please do not modify existing entries for backwards compatibility.

#### Signature {#telemetrydatatag-signature}

```typescript
export declare enum TelemetryDataTag 
```

#### Flags

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Flag
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#telemetrydatatag-codeartifact-enummember'>CodeArtifact</a>
      </td>
      <td>
        Data containing terms or IDs from code packages that may have been dynamically loaded
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#telemetrydatatag-userdata-enummember'>UserData</a>
      </td>
      <td>
        Personal data of a variety of classifications that pertains to the user
      </td>
    </tr>
  </tbody>
</table>

#### FlagDetails

##### CodeArtifact {#telemetrydatatag-codeartifact-enummember}

Data containing terms or IDs from code packages that may have been dynamically loaded

###### Signature {#codeartifact-signature}

```typescript
CodeArtifact = "CodeArtifact"
```

##### UserData {#telemetrydatatag-userdata-enummember}

Personal data of a variety of classifications that pertains to the user

###### Signature {#userdata-signature}

```typescript
UserData = "UserData"
```

## Type Details

### ConfigTypes {#configtypes-typealias}

#### Signature {#configtypes-signature}

```typescript
export declare type ConfigTypes = string | number | boolean | number[] | string[] | boolean[] | undefined;
```

### TelemetryEventPropertyTypeExt {#telemetryeventpropertytypeext-typealias}

Property types that can be logged. Includes extra types beyond TelemetryEventPropertyType (which will be deprecated in favor of this one)

#### Signature {#telemetryeventpropertytypeext-signature}

```typescript
export declare type TelemetryEventPropertyTypeExt = string | number | boolean | undefined | (string | number | boolean)[];
```

### TelemetryEventPropertyTypes {#telemetryeventpropertytypes-typealias}

#### Signature {#telemetryeventpropertytypes-signature}

```typescript
export declare type TelemetryEventPropertyTypes = TelemetryEventPropertyType | ITaggedTelemetryPropertyType;
```

## Function Details

### extractLogSafeErrorProperties {#extractlogsafeerrorproperties-function}

Inspect the given error for common "safe" props and return them

#### Signature {#extractlogsafeerrorproperties-signature}

```typescript
export declare function extractLogSafeErrorProperties(error: any, sanitizeStack: boolean): {
    message: string;
    errorType?: string | undefined;
    stack?: string | undefined;
};
```

#### Parameters {#extractlogsafeerrorproperties-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        error
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        sanitizeStack
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#extractlogsafeerrorproperties-returns}

<b>Return type:</b> { message: string; errorType?: string \| undefined; stack?: string \| undefined; }

### generateErrorWithStack {#generateerrorwithstack-function}

The purpose of this function is to provide ability to capture stack context quickly. Accessing new Error().stack is slow, and the slowest part is accessing stack property itself. There are scenarios where we generate error with stack, but error is handled in most cases and stack property is not accessed. For such cases it's better to not read stack property right away, but rather delay it until / if it's needed Some browsers will populate stack right away, others require throwing Error, so we do auto-detection on the fly.

#### Signature {#generateerrorwithstack-signature}

```typescript
export declare function generateErrorWithStack(): Error;
```

#### Returns {#generateerrorwithstack-returns}

Error object that has stack populated.

<b>Return type:</b> Error

### generateStack {#generatestack-function}

#### Signature {#generatestack-signature}

```typescript
export declare function generateStack(): string | undefined;
```

#### Returns {#generatestack-returns}

<b>Return type:</b> string \| undefined

### isExternalError {#isexternalerror-function}

True for any error object that is an (optionally normalized) external error False for any error we created and raised within the FF codebase via LoggingError base class, or wrapped in a well-known error type

#### Signature {#isexternalerror-signature}

```typescript
export declare function isExternalError(e: any): boolean;
```

#### Parameters {#isexternalerror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        e
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isexternalerror-returns}

<b>Return type:</b> boolean

### isFluidError {#isfluiderror-function}

type guard for IFluidErrorBase interface

#### Signature {#isfluiderror-signature}

```typescript
export declare function isFluidError(e: any): e is IFluidErrorBase;
```

#### Parameters {#isfluiderror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        e
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isfluiderror-returns}

<b>Return type:</b> e is [IFluidErrorBase](/docs/apis/telemetry-utils\ifluiderrorbase-interface)

### isTaggedTelemetryPropertyValue {#istaggedtelemetrypropertyvalue-function}

Type guard to identify if a particular telemetry property appears to be a tagged telemetry property

#### Signature {#istaggedtelemetrypropertyvalue-signature}

```typescript
export declare function isTaggedTelemetryPropertyValue(x: ITaggedTelemetryPropertyTypeExt | TelemetryEventPropertyTypeExt): x is ITaggedTelemetryPropertyType | ITaggedTelemetryPropertyTypeExt;
```

#### Parameters {#istaggedtelemetrypropertyvalue-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        x
      </td>
      <td>
        <a href='/docs/apis/telemetry-utils\itaggedtelemetrypropertytypeext-interface'>ITaggedTelemetryPropertyTypeExt</a> | <a href='/docs/apis/telemetry-utils#telemetryeventpropertytypeext-typealias'>TelemetryEventPropertyTypeExt</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#istaggedtelemetrypropertyvalue-returns}

<b>Return type:</b> x is [ITaggedTelemetryPropertyType](/docs/apis/common-definitions\itaggedtelemetrypropertytype-interface) \| [ITaggedTelemetryPropertyTypeExt](/docs/apis/telemetry-utils\itaggedtelemetrypropertytypeext-interface)

### isValidLegacyError {#isvalidlegacyerror-function}

type guard for old standard of valid/known errors

#### Signature {#isvalidlegacyerror-signature}

```typescript
export declare function isValidLegacyError(e: any): e is Omit<IFluidErrorBase, "errorInstanceId">;
```

#### Parameters {#isvalidlegacyerror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        e
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isvalidlegacyerror-returns}

<b>Return type:</b> e is Omit&lt;[IFluidErrorBase](/docs/apis/telemetry-utils\ifluiderrorbase-interface)<!-- -->, "errorInstanceId"&gt;

### loggerToMonitoringContext {#loggertomonitoringcontext-function}

#### Signature {#loggertomonitoringcontext-signature}

```typescript
export declare function loggerToMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLogger>(logger: L): MonitoringContext<L>;
```

#### Parameters {#loggertomonitoringcontext-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        logger
      </td>
      <td>
        L
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#loggertomonitoringcontext-returns}

<b>Return type:</b> [MonitoringContext](/docs/apis/telemetry-utils\monitoringcontext-interface)<!-- -->&lt;L&gt;

### logIfFalse {#logiffalse-function}

Like assert, but logs only if the condition is false, rather than throwing

#### Signature {#logiffalse-signature}

```typescript
export declare function logIfFalse(condition: any, logger: ITelemetryBaseLogger, event: string | ITelemetryGenericEvent): condition is true;
```

#### Parameters {#logiffalse-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        condition
      </td>
      <td>
        any
      </td>
      <td>
        The condition to attest too
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrybaselogger-interface'>ITelemetryBaseLogger</a>
      </td>
      <td>
        The logger to log with
      </td>
    </tr>
    <tr>
      <td>
        event
      </td>
      <td>
        string | <a href='/docs/apis/common-definitions\itelemetrygenericevent-interface'>ITelemetryGenericEvent</a>
      </td>
      <td>
        The string or event to log
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#logiffalse-returns}

- The outcome of the condition

<b>Return type:</b> condition is true

### mixinMonitoringContext {#mixinmonitoringcontext-function}

#### Signature {#mixinmonitoringcontext-signature}

```typescript
export declare function mixinMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLogger>(logger: L, ...configs: (IConfigProviderBase | undefined)[]): MonitoringContext<L>;
```

#### Parameters {#mixinmonitoringcontext-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        logger
      </td>
      <td>
        L
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        configs
      </td>
      <td>
        (<a href='/docs/apis/telemetry-utils\iconfigproviderbase-interface'>IConfigProviderBase</a> | undefined)[]
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#mixinmonitoringcontext-returns}

<b>Return type:</b> [MonitoringContext](/docs/apis/telemetry-utils\monitoringcontext-interface)<!-- -->&lt;L&gt;

### normalizeError {#normalizeerror-function}

Normalize the given error yielding a valid Fluid Error

#### Signature {#normalizeerror-signature}

```typescript
export declare function normalizeError(error: unknown, annotations?: IFluidErrorAnnotations): IFluidErrorBase;
```

#### Parameters {#normalizeerror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        error
      </td>
      <td>
      </td>
      <td>
        unknown
      </td>
      <td>
        The error to normalize
      </td>
    </tr>
    <tr>
      <td>
        annotations
      </td>
      <td>
        optional
      </td>
      <td>
        <a href='/docs/apis/telemetry-utils\ifluiderrorannotations-interface'>IFluidErrorAnnotations</a>
      </td>
      <td>
        Annotations to apply to the normalized error
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#normalizeerror-returns}

A valid Fluid Error with any provided annotations applied

<b>Return type:</b> [IFluidErrorBase](/docs/apis/telemetry-utils\ifluiderrorbase-interface)

### raiseConnectedEvent {#raiseconnectedevent-function}

Raises events pertaining to the connection

#### Signature {#raiseconnectedevent-signature}

```typescript
export declare function raiseConnectedEvent(logger: ITelemetryLogger, emitter: EventEmitter, connected: boolean, clientId?: string, disconnectedReason?: string): void;
```

#### Parameters {#raiseconnectedevent-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        logger
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
        The logger to log telemetry
      </td>
    </tr>
    <tr>
      <td>
        emitter
      </td>
      <td>
      </td>
      <td>
        EventEmitter
      </td>
      <td>
        The event emitter instance
      </td>
    </tr>
    <tr>
      <td>
        connected
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
        A boolean tracking whether the connection was in a connected state or not
      </td>
    </tr>
    <tr>
      <td>
        clientId
      </td>
      <td>
        optional
      </td>
      <td>
        string
      </td>
      <td>
        The connected/disconnected clientId
      </td>
    </tr>
    <tr>
      <td>
        disconnectedReason
      </td>
      <td>
        optional
      </td>
      <td>
        string
      </td>
      <td>
        The reason for the connection to be disconnected (Used for telemetry purposes only)
      </td>
    </tr>
  </tbody>
</table>

### safeRaiseEvent {#saferaiseevent-function}

#### Signature {#saferaiseevent-signature}

```typescript
export declare function safeRaiseEvent(emitter: EventEmitter, logger: ITelemetryLogger, event: string, ...args: any[]): void;
```

#### Parameters {#saferaiseevent-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        emitter
      </td>
      <td>
        EventEmitter
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        event
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        args
      </td>
      <td>
        any[]
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### wrapError {#wraperror-function}

Create a new error using newErrorFn, wrapping and caused by the given unknown error. Copies the inner error's stack, errorInstanceId and telemetry props over to the new error if present

#### Signature {#wraperror-signature}

```typescript
export declare function wrapError<T extends LoggingError>(innerError: unknown, newErrorFn: (message: string) => T): T;
```

#### Parameters {#wraperror-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        innerError
      </td>
      <td>
        unknown
      </td>
      <td>
        An error from untrusted/unknown origins
      </td>
    </tr>
    <tr>
      <td>
        newErrorFn
      </td>
      <td>
        (message: string) => T
      </td>
      <td>
        callback that will create a new error given the original error's message
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#wraperror-returns}

A new error object "wrapping" the given error

<b>Return type:</b> T

### wrapErrorAndLog {#wraperrorandlog-function}

The same as wrapError, but also logs the innerError, including the wrapping error's instance id

#### Signature {#wraperrorandlog-signature}

```typescript
export declare function wrapErrorAndLog<T extends LoggingError>(innerError: unknown, newErrorFn: (message: string) => T, logger: ITelemetryLogger): T;
```

#### Parameters {#wraperrorandlog-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        innerError
      </td>
      <td>
        unknown
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        newErrorFn
      </td>
      <td>
        (message: string) => T
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#wraperrorandlog-returns}

<b>Return type:</b> T

## Variable Details

### connectedEventName {#connectedeventname-variable}

#### Signature {#connectedeventname-signature}

```typescript
connectedEventName = "connected"
```

### disconnectedEventName {#disconnectedeventname-variable}

#### Signature {#disconnectedeventname-signature}

```typescript
disconnectedEventName = "disconnected"
```

### getCircularReplacer {#getcircularreplacer-variable}

Borrowed from [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples) Avoids runtime errors with circular references. Not ideal, as will cut values that are not necessarily circular references. Could be improved by implementing Node's util.inspect() for browser (minus all the coloring code)

#### Signature {#getcircularreplacer-signature}

```typescript
getCircularReplacer: () => (key: string, value: any) => any
```

### hasErrorInstanceId {#haserrorinstanceid-variable}

#### Signature {#haserrorinstanceid-signature}

```typescript
hasErrorInstanceId: (x: any) => x is {
    errorInstanceId: string;
}
```

### isILoggingError {#isiloggingerror-variable}

type guard for ILoggingError interface

#### Signature {#isiloggingerror-signature}

```typescript
isILoggingError: (x: any) => x is ILoggingError
```

### NORMALIZED\_ERROR\_TYPE {#normalized_error_type-variable}

The Error class used when normalizing an external error

#### Signature {#normalized_error_type-signature}

```typescript
NORMALIZED_ERROR_TYPE = "genericError"
```

### sessionStorageConfigProvider {#sessionstorageconfigprovider-variable}

Creates a base configuration provider based on `sessionStorage`

#### Signature {#sessionstorageconfigprovider-signature}

```typescript
sessionStorageConfigProvider: Lazy<IConfigProviderBase>
```