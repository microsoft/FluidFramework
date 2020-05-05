{{/* vim: set filetype=mustache: */}}

{{/* TODO: there must be a better way to unify these names? */}}

{{/*
Expand the name of the chart.
*/}}
{{- define "routerlicious.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}

{{- define "routerlicious.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "alfred.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.alfred.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "deli.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.deli.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "scriptorium.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.scriptorium.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "scribe.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.scribe.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "routemaster.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.routemaster.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "foreman.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.foreman.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "riddler.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.riddler.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
