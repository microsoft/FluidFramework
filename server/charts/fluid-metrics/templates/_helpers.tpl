{{/* vim: set filetype=mustache: */}}

{{- define "metrics.fullname" -}}
{{- printf "%s-%s" .Release.Name "fluid-metrics" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
