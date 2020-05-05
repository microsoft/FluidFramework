{{/* vim: set filetype=mustache: */}}

{{- define "routerlicious.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "routerlicious.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "jarvis.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.jarvis.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "deli.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.deli.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "scriptorium.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.scriptorium.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
