{{/* vim: set filetype=mustache: */}}

{{/* TODO: there must be a better way to unify these names? */}}
{{/*
Create a default fully qualified master name for all services.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}

{{- define "historian.fullname" -}}
{{- printf "%s-%s" .Release.Name "historian" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gitrest.fullname" -}}
{{- printf "%s-%s" .Release.Name "gitrest" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gitssh.fullname" -}}
{{- printf "%s-%s" .Release.Name "gitssh" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cobalt.fullname" -}}
{{- printf "%s-%s" .Release.Name "cobalt" | trunc 63 | trimSuffix "-" -}}
{{- end -}}