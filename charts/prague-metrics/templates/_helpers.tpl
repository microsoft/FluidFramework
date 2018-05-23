{{/* vim: set filetype=mustache: */}}

{{- define "metrics.fullname" -}}
{{- printf "%s-%s" .Release.Name "prague-metrics" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
