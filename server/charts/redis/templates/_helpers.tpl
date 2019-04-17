{{/* vim: set filetype=mustache: */}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "redis.fullname" -}}
{{- printf "%s-%s" .Release.Name "redis" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
