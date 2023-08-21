{
  "title": "@fluidframework/telemetry-utils Package",
  "kind": "Package",
  "members": {
    "TypeAlias": {
      "ConfigTypes": "/docs/apis/telemetry-utils#configtypes-typealias",
      "TelemetryEventPropertyTypeExt": "/docs/apis/telemetry-utils#telemetryeventpropertytypeext-typealias",
      "TelemetryEventPropertyTypes": "/docs/apis/telemetry-utils#telemetryeventpropertytypes-typealias"
    },
    "Variable": {
      "connectedEventName": "/docs/apis/telemetry-utils#connectedeventname-variable",
      "disconnectedEventName": "/docs/apis/telemetry-utils#disconnectedeventname-variable",
      "eventNamespaceSeparator": "/docs/apis/telemetry-utils#eventnamespaceseparator-variable",
      "getCircularReplacer": "/docs/apis/telemetry-utils#getcircularreplacer-variable",
      "hasErrorInstanceId": "/docs/apis/telemetry-utils#haserrorinstanceid-variable",
      "isILoggingError": "/docs/apis/telemetry-utils#isiloggingerror-variable",
      "NORMALIZED_ERROR_TYPE": "/docs/apis/telemetry-utils#normalized_error_type-variable",
      "sessionStorageConfigProvider": "/docs/apis/telemetry-utils#sessionstorageconfigprovider-variable",
      "tagCodeArtifacts": "/docs/apis/telemetry-utils#tagcodeartifacts-variable",
      "tagData": "/docs/apis/telemetry-utils#tagdata-variable"
    },
    "Function": {
      "createChildLogger": "/docs/apis/telemetry-utils#createchildlogger-function",
      "createChildMonitoringContext": "/docs/apis/telemetry-utils#createchildmonitoringcontext-function",
      "createMultiSinkLogger": "/docs/apis/telemetry-utils#createmultisinklogger-function",
      "extractLogSafeErrorProperties": "/docs/apis/telemetry-utils#extractlogsafeerrorproperties-function",
      "formatTick": "/docs/apis/telemetry-utils#formattick-function",
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
      "numberFromString": "/docs/apis/telemetry-utils#numberfromstring-function",
      "raiseConnectedEvent": "/docs/apis/telemetry-utils#raiseconnectedevent-function",
      "safeRaiseEvent": "/docs/apis/telemetry-utils#saferaiseevent-function",
      "wrapError": "/docs/apis/telemetry-utils#wraperror-function",
      "wrapErrorAndLog": "/docs/apis/telemetry-utils#wraperrorandlog-function"
    },
    "Class": {
      "EventEmitterWithErrorHandling": "/docs/apis/telemetry-utils/eventemitterwitherrorhandling-class",
      "LoggingError": "/docs/apis/telemetry-utils/loggingerror-class",
      "MockLogger": "/docs/apis/telemetry-utils/mocklogger-class",
      "PerformanceEvent": "/docs/apis/telemetry-utils/performanceevent-class",
      "SampledTelemetryHelper": "/docs/apis/telemetry-utils/sampledtelemetryhelper-class",
      "TaggedLoggerAdapter": "/docs/apis/telemetry-utils/taggedloggeradapter-class",
      "TelemetryNullLogger": "/docs/apis/telemetry-utils/telemetrynulllogger-class",
      "ThresholdCounter": "/docs/apis/telemetry-utils/thresholdcounter-class"
    },
    "Interface": {
      "IConfigProvider": "/docs/apis/telemetry-utils/iconfigprovider-interface",
      "IConfigProviderBase": "/docs/apis/telemetry-utils/iconfigproviderbase-interface",
      "IFluidErrorAnnotations": "/docs/apis/telemetry-utils/ifluiderrorannotations-interface",
      "IFluidErrorBase": "/docs/apis/telemetry-utils/ifluiderrorbase-interface",
      "IPerformanceEventMarkers": "/docs/apis/telemetry-utils/iperformanceeventmarkers-interface",
      "ITaggedTelemetryPropertyTypeExt": "/docs/apis/telemetry-utils/itaggedtelemetrypropertytypeext-interface",
      "ITelemetryErrorEventExt": "/docs/apis/telemetry-utils/itelemetryerroreventext-interface",
      "ITelemetryEventExt": "/docs/apis/telemetry-utils/itelemetryeventext-interface",
      "ITelemetryGenericEventExt": "/docs/apis/telemetry-utils/itelemetrygenericeventext-interface",
      "ITelemetryLoggerExt": "/docs/apis/telemetry-utils/itelemetryloggerext-interface",
      "ITelemetryLoggerPropertyBag": "/docs/apis/telemetry-utils/itelemetryloggerpropertybag-interface",
      "ITelemetryLoggerPropertyBags": "/docs/apis/telemetry-utils/itelemetryloggerpropertybags-interface",
      "ITelemetryPerformanceEventExt": "/docs/apis/telemetry-utils/itelemetryperformanceeventext-interface",
      "ITelemetryPropertiesExt": "/docs/apis/telemetry-utils/itelemetrypropertiesext-interface",
      "MonitoringContext": "/docs/apis/telemetry-utils/monitoringcontext-interface"
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
      <th>
        Interface
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/iconfigprovider-interface'>IConfigProvider</a>
      </td>
      <td>
        Explicitly typed interface for reading configurations
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/iconfigproviderbase-interface'>IConfigProviderBase</a>
      </td>
      <td>
        Base interface for providing configurations to enable/disable/control features
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/ifluiderrorannotations-interface'>IFluidErrorAnnotations</a>
      </td>
      <td>
        Metadata to annotate an error object when annotating or normalizing it
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/ifluiderrorbase-interface'>IFluidErrorBase</a>
      </td>
      <td>
        All normalized errors flowing through the Fluid Framework adhere to this readonly interface. It features errorType and errorInstanceId on top of Error's members as readonly, and a getter/setter for telemetry props to be included when the error is logged.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/iperformanceeventmarkers-interface'>IPerformanceEventMarkers</a>
      </td>
      <td>
        Describes what events PerformanceEvent should log By default, all events are logged, but client can override this behavior For example, there is rarely a need to record start event, as we really after success / failure tracking, including duration (on success).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itaggedtelemetrypropertytypeext-interface'>ITaggedTelemetryPropertyTypeExt</a>
      </td>
      <td>
        A property to be logged to telemetry containing both the value and a tag. Tags are generic strings that can be used to mark pieces of information that should be organized or handled differently by loggers in various first or third party scenarios. For example, tags are used to mark personal information that should not be stored in logs.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetryerroreventext-interface'>ITelemetryErrorEventExt</a>
      </td>
      <td>
        Error telemetry event. Maps to category = &quot;error&quot;
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetryeventext-interface'>ITelemetryEventExt</a>
      </td>
      <td>
        Interface for logging telemetry statements. Can contain any number of properties that get serialized as json payload.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetrygenericeventext-interface'>ITelemetryGenericEventExt</a>
      </td>
      <td>
        Informational (non-error) telemetry event Maps to category = &quot;generic&quot;
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a>
      </td>
      <td>
        An extended TelemetryLogger interface which allows for more lenient event types. This interface is meant to be used internally within the Fluid Framework, and ITelemetryBaseLogger should be used when loggers are passed between layers.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetryloggerpropertybag-interface'>ITelemetryLoggerPropertyBag</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetryloggerpropertybags-interface'>ITelemetryLoggerPropertyBags</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetryperformanceeventext-interface'>ITelemetryPerformanceEventExt</a>
      </td>
      <td>
        Performance telemetry event. Maps to category = &quot;performance&quot;
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/itelemetrypropertiesext-interface'>ITelemetryPropertiesExt</a>
      </td>
      <td>
        JSON-serializable properties, which will be logged with telemetry.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/monitoringcontext-interface'>MonitoringContext</a>
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
      <th>
        Class
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/eventemitterwitherrorhandling-class'>EventEmitterWithErrorHandling</a>
      </td>
      <td>
      </td>
      <td>
        Event Emitter helper class Any exceptions thrown by listeners will be caught and raised through &quot;error&quot; event. Any exception thrown by &quot;error&quot; listeners will propagate to the caller.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/loggingerror-class'>LoggingError</a>
      </td>
      <td>
      </td>
      <td>
        <p>
          Base class for &quot;trusted&quot; errors we create, whose properties can generally be logged to telemetry safely. All properties set on the object, or passed in (via the constructor or addTelemetryProperties), will be logged in accordance with their tag, if present.
        </p>
        <p>
          PLEASE take care to avoid setting sensitive data on this object without proper tagging!
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/mocklogger-class'>MockLogger</a>
      </td>
      <td>
      </td>
      <td>
        The MockLogger records events sent to it, and then can walk back over those events searching for a set of expected events to match against the logged events.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/performanceevent-class'>PerformanceEvent</a>
      </td>
      <td>
      </td>
      <td>
        Helper class to log performance events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/sampledtelemetryhelper-class'>SampledTelemetryHelper</a>
      </td>
      <td>
      </td>
      <td>
        Helper class that executes a specified code block and writes an <span><i>@fluidframework/core-interfaces#ITelemetryPerformanceEvent</i></span> to a specified logger every time a specified number of executions is reached (or when the class is disposed). The <code>duration</code> field in the telemetry event is the duration of the latest execution (sample) of the specified function. See the documentation of the <code>includeAggregateMetrics</code> parameter for additional details that can be included.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/taggedloggeradapter-class'>TaggedLoggerAdapter</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/telemetrynulllogger-class'>TelemetryNullLogger</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        Null logger that no-ops for all telemetry events passed to it.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils/thresholdcounter-class'>ThresholdCounter</a>
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
      <th>
        Enum
      </th>
      <th>
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
      <th>
        TypeAlias
      </th>
      <th>
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
      <th>
        Function
      </th>
      <th>
        Return Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#createchildlogger-function'>createChildLogger</a>
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a></span>
      </td>
      <td>
        Create a child logger based on the provided props object
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#createchildmonitoringcontext-function'>createChildMonitoringContext</a>
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/monitoringcontext-interface'>MonitoringContext</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#createmultisinklogger-function'>createMultiSinkLogger</a>
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a></span>
      </td>
      <td>
        Create a logger which logs to multiple other loggers based on the provided props object
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#extractlogsafeerrorproperties-function'>extractLogSafeErrorProperties</a>
      </td>
      <td>
        <span>{     message: string;     errorType?: string &#124; undefined;     stack?: string &#124; undefined; }</span>
      </td>
      <td>
        Inspect the given error for common &quot;safe&quot; props and return them
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#formattick-function'>formatTick</a>
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#generateerrorwithstack-function'>generateErrorWithStack</a>
      </td>
      <td>
        <span>Error</span>
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
        <span>string &#124; undefined</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#isexternalerror-function'>isExternalError</a>
      </td>
      <td>
        <span>boolean</span>
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
        <span>e is <a href='/docs/apis/telemetry-utils/ifluiderrorbase-interface'>IFluidErrorBase</a></span>
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
        <span>x is ITaggedTelemetryPropertyType &#124; <a href='/docs/apis/telemetry-utils/itaggedtelemetrypropertytypeext-interface'>ITaggedTelemetryPropertyTypeExt</a></span>
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
        <span>e is Omit&lt;<a href='/docs/apis/telemetry-utils/ifluiderrorbase-interface'>IFluidErrorBase</a>, &quot;errorInstanceId&quot;&gt;</span>
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
        <span><a href='/docs/apis/telemetry-utils/monitoringcontext-interface'>MonitoringContext</a>&lt;L&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#logiffalse-function'>logIfFalse</a>
      </td>
      <td>
        <span>condition is true</span>
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
        <span><a href='/docs/apis/telemetry-utils/monitoringcontext-interface'>MonitoringContext</a>&lt;L&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#normalizeerror-function'>normalizeError</a>
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/ifluiderrorbase-interface'>IFluidErrorBase</a></span>
      </td>
      <td>
        Normalize the given error yielding a valid Fluid Error
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#numberfromstring-function'>numberFromString</a>
      </td>
      <td>
        <span>string &#124; number &#124; undefined</span>
      </td>
      <td>
        Attempts to parse number from string. If fails,returns original string. Used to make telemetry data typed (and support math operations, like comparison), in places where we do expect numbers (like contentsize/duration property in http header)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#raiseconnectedevent-function'>raiseConnectedEvent</a>
      </td>
      <td>
        <span>void</span>
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
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#wraperror-function'>wrapError</a>
      </td>
      <td>
        <span>T</span>
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
        <span>T</span>
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
      <th>
        Variable
      </th>
      <th>
        Modifiers
      </th>
      <th>
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
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#disconnectedeventname-variable'>disconnectedEventName</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#eventnamespaceseparator-variable'>eventNamespaceSeparator</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#getcircularreplacer-variable'>getCircularReplacer</a>
      </td>
      <td>
        <code>readonly</code>
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
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#isiloggingerror-variable'>isILoggingError</a>
      </td>
      <td>
        <code>readonly</code>
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
        <code>readonly</code>
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
        <code>readonly</code>
      </td>
      <td>
        Creates a base configuration provider based on <code>sessionStorage</code>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#tagcodeartifacts-variable'>tagCodeArtifacts</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/telemetry-utils#tagdata-variable'>tagData</a>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
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
      <th>
        Flag
      </th>
      <th>
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
export declare type TelemetryEventPropertyTypeExt = string | number | boolean | undefined | (string | number | boolean)[] | {
    [key: string]: // Flat objects can have the same properties as the event itself
    string | number | boolean | undefined | (string | number | boolean)[];
};
```

### TelemetryEventPropertyTypes {#telemetryeventpropertytypes-typealias}

#### Signature {#telemetryeventpropertytypes-signature}

```typescript
export declare type TelemetryEventPropertyTypes = TelemetryEventPropertyType | ITaggedTelemetryPropertyType;
```

## Function Details

### createChildLogger {#createchildlogger-function}

Create a child logger based on the provided props object

#### Signature {#createchildlogger-signature}

```typescript
export declare function createChildLogger(props?: {
    logger?: ITelemetryBaseLogger;
    namespace?: string;
    properties?: ITelemetryLoggerPropertyBags;
}): ITelemetryLoggerExt;
```

#### Remarks {#createchildlogger-remarks}

Passing in no props object (i.e. undefined) will return a logger that is effectively a no-op.

#### Parameters {#createchildlogger-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        props
      </td>
      <td>
        optional
      </td>
      <td>
        <span>{     logger?: ITelemetryBaseLogger;     namespace?: string;     properties?: <a href='/docs/apis/telemetry-utils/itelemetryloggerpropertybags-interface'>ITelemetryLoggerPropertyBags</a>; }</span>
      </td>
      <td>
        logger is the base logger the child will log to after it's processing, namespace will be prefixed to all event names, properties are default properties that will be applied events.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createchildlogger-returns}

**Return type:** [ITelemetryLoggerExt](/docs/apis/telemetry-utils/itelemetryloggerext-interface)

### createChildMonitoringContext {#createchildmonitoringcontext-function}

#### Signature {#createchildmonitoringcontext-signature}

```typescript
export declare function createChildMonitoringContext(props: Parameters<typeof createChildLogger>[0]): MonitoringContext;
```

#### Parameters {#createchildmonitoringcontext-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        props
      </td>
      <td>
        <span>Parameters&lt;typeof createChildLogger&gt;[0]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createchildmonitoringcontext-returns}

**Return type:** [MonitoringContext](/docs/apis/telemetry-utils/monitoringcontext-interface)

### createMultiSinkLogger {#createmultisinklogger-function}

Create a logger which logs to multiple other loggers based on the provided props object

#### Signature {#createmultisinklogger-signature}

```typescript
export declare function createMultiSinkLogger(props: {
    namespace?: string;
    properties?: ITelemetryLoggerPropertyBags;
    loggers?: (ITelemetryBaseLogger | undefined)[];
    tryInheritProperties?: true;
}): ITelemetryLoggerExt;
```

#### Parameters {#createmultisinklogger-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        props
      </td>
      <td>
        <span>{     namespace?: string;     properties?: <a href='/docs/apis/telemetry-utils/itelemetryloggerpropertybags-interface'>ITelemetryLoggerPropertyBags</a>;     loggers?: (ITelemetryBaseLogger &#124; undefined)[];     tryInheritProperties?: true; }</span>
      </td>
      <td>
        loggers are the base loggers that will logged to after it's processing, namespace will be prefixed to all event names, properties are default properties that will be applied events. tryInheritProperties will attempted to copy those loggers properties to this loggers if they are of a known type e.g. one from this package
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createmultisinklogger-returns}

**Return type:** [ITelemetryLoggerExt](/docs/apis/telemetry-utils/itelemetryloggerext-interface)

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>any</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        sanitizeStack
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#extractlogsafeerrorproperties-returns}

**Return type:** {     message: string;     errorType?: string \| undefined;     stack?: string \| undefined; }

### formatTick {#formattick-function}

#### Signature {#formattick-signature}

```typescript
export declare function formatTick(tick: number): number;
```

#### Parameters {#formattick-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        tick
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#formattick-returns}

**Return type:** number

### generateErrorWithStack {#generateerrorwithstack-function}

The purpose of this function is to provide ability to capture stack context quickly. Accessing new Error().stack is slow, and the slowest part is accessing stack property itself. There are scenarios where we generate error with stack, but error is handled in most cases and stack property is not accessed. For such cases it's better to not read stack property right away, but rather delay it until / if it's needed Some browsers will populate stack right away, others require throwing Error, so we do auto-detection on the fly.

#### Signature {#generateerrorwithstack-signature}

```typescript
export declare function generateErrorWithStack(): Error;
```

#### Returns {#generateerrorwithstack-returns}

Error object that has stack populated.

**Return type:** Error

### generateStack {#generatestack-function}

#### Signature {#generatestack-signature}

```typescript
export declare function generateStack(): string | undefined;
```

#### Returns {#generatestack-returns}

**Return type:** string \| undefined

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>any</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isexternalerror-returns}

**Return type:** boolean

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>any</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isfluiderror-returns}

**Return type:** e is [IFluidErrorBase](/docs/apis/telemetry-utils/ifluiderrorbase-interface)

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/telemetry-utils/itaggedtelemetrypropertytypeext-interface'>ITaggedTelemetryPropertyTypeExt</a> &#124; <a href='/docs/apis/telemetry-utils#telemetryeventpropertytypeext-typealias'>TelemetryEventPropertyTypeExt</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#istaggedtelemetrypropertyvalue-returns}

**Return type:** x is ITaggedTelemetryPropertyType \| [ITaggedTelemetryPropertyTypeExt](/docs/apis/telemetry-utils/itaggedtelemetrypropertytypeext-interface)

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>any</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#isvalidlegacyerror-returns}

**Return type:** e is Omit&lt;[IFluidErrorBase](/docs/apis/telemetry-utils/ifluiderrorbase-interface), "errorInstanceId"&gt;

### loggerToMonitoringContext {#loggertomonitoringcontext-function}

#### Signature {#loggertomonitoringcontext-signature}

```typescript
export declare function loggerToMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLoggerExt>(logger: L): MonitoringContext<L>;
```

#### Parameters {#loggertomonitoringcontext-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>L</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#loggertomonitoringcontext-returns}

**Return type:** [MonitoringContext](/docs/apis/telemetry-utils/monitoringcontext-interface)&lt;L&gt;

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>any</span>
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
        <span>ITelemetryBaseLogger</span>
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
        <span>string &#124; ITelemetryGenericEvent</span>
      </td>
      <td>
        The string or event to log
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#logiffalse-returns}

- The outcome of the condition

**Return type:** condition is true

### mixinMonitoringContext {#mixinmonitoringcontext-function}

#### Signature {#mixinmonitoringcontext-signature}

```typescript
export declare function mixinMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLoggerExt>(logger: L, ...configs: (IConfigProviderBase | undefined)[]): MonitoringContext<L>;
```

#### Parameters {#mixinmonitoringcontext-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>L</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        configs
      </td>
      <td>
        <span>(<a href='/docs/apis/telemetry-utils/iconfigproviderbase-interface'>IConfigProviderBase</a> &#124; undefined)[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#mixinmonitoringcontext-returns}

**Return type:** [MonitoringContext](/docs/apis/telemetry-utils/monitoringcontext-interface)&lt;L&gt;

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
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>unknown</span>
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
        <span><a href='/docs/apis/telemetry-utils/ifluiderrorannotations-interface'>IFluidErrorAnnotations</a></span>
      </td>
      <td>
        Annotations to apply to the normalized error
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#normalizeerror-returns}

A valid Fluid Error with any provided annotations applied

**Return type:** [IFluidErrorBase](/docs/apis/telemetry-utils/ifluiderrorbase-interface)

### numberFromString {#numberfromstring-function}

Attempts to parse number from string. If fails,returns original string. Used to make telemetry data typed (and support math operations, like comparison), in places where we do expect numbers (like contentsize/duration property in http header)

#### Signature {#numberfromstring-signature}

```typescript
export declare function numberFromString(str: string | null | undefined): string | number | undefined;
```

#### Parameters {#numberfromstring-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        str
      </td>
      <td>
        <span>string &#124; null &#124; undefined</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#numberfromstring-returns}

**Return type:** string \| number \| undefined

### raiseConnectedEvent {#raiseconnectedevent-function}

Raises events pertaining to the connection

#### Signature {#raiseconnectedevent-signature}

```typescript
export declare function raiseConnectedEvent(logger: ITelemetryLoggerExt, emitter: EventEmitter, connected: boolean, clientId?: string, disconnectedReason?: string): void;
```

#### Parameters {#raiseconnectedevent-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a></span>
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
        <span>EventEmitter</span>
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
        <span>boolean</span>
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
        <span>string</span>
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
        <span>string</span>
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
export declare function safeRaiseEvent(emitter: EventEmitter, logger: ITelemetryLoggerExt, event: string, ...args: any[]): void;
```

#### Parameters {#saferaiseevent-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>EventEmitter</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        event
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        args
      </td>
      <td>
        <span>any[]</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>unknown</span>
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
        <span>(message: string) =&gt; T</span>
      </td>
      <td>
        callback that will create a new error given the original error's message
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#wraperror-returns}

A new error object "wrapping" the given error

**Return type:** T

### wrapErrorAndLog {#wraperrorandlog-function}

The same as wrapError, but also logs the innerError, including the wrapping error's instance id

#### Signature {#wraperrorandlog-signature}

```typescript
export declare function wrapErrorAndLog<T extends LoggingError>(innerError: unknown, newErrorFn: (message: string) => T, logger: ITelemetryLoggerExt): T;
```

#### Parameters {#wraperrorandlog-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>unknown</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        newErrorFn
      </td>
      <td>
        <span>(message: string) =&gt; T</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        logger
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#wraperrorandlog-returns}

**Return type:** T

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

### eventNamespaceSeparator {#eventnamespaceseparator-variable}

#### Signature {#eventnamespaceseparator-signature}

```typescript
eventNamespaceSeparator: ":"
```

### getCircularReplacer {#getcircularreplacer-variable}

Borrowed from [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic\_object\_value\#examples](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples) Avoids runtime errors with circular references. Not ideal, as will cut values that are not necessarily circular references. Could be improved by implementing Node's util.inspect() for browser (minus all the coloring code)

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

### tagCodeArtifacts {#tagcodeartifacts-variable}

#### Signature {#tagcodeartifacts-signature}

```typescript
tagCodeArtifacts: <T extends Record<string, TelemetryEventPropertyTypeExt>>(values: T) => { [P in keyof T]: {
    value: Exclude<T[P], undefined>;
    tag: TelemetryDataTag.CodeArtifact;
} | (T[P] extends undefined ? undefined : never); }
```

### tagData {#tagdata-variable}

#### Signature {#tagdata-signature}

```typescript
tagData: <T extends TelemetryDataTag, V extends Record<string, TelemetryEventPropertyTypeExt>>(tag: T, values: V) => { [P in keyof V]: {
    value: Exclude<V[P], undefined>;
    tag: T;
} | (V[P] extends undefined ? undefined : never); }
```
