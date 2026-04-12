from django.contrib import admin
from .models import PlanilhaConfig, ProjecaoDia, Operacao, DiarioEntry, Regra


@admin.register(PlanilhaConfig)
class PlanilhaConfigAdmin(admin.ModelAdmin):
    list_display = ['user', 'month', 'banca_inicial', 'dias_uteis', 'updated_at']
    list_filter = ['month', 'user']
    search_fields = ['user__username']


@admin.register(ProjecaoDia)
class ProjecaoDiaAdmin(admin.ModelAdmin):
    list_display = ['user', 'month', 'dia', 'realizado', 'custo_op', 'imposto_retido']
    list_filter = ['month', 'user']


@admin.register(Operacao)
class OperacaoAdmin(admin.ModelAdmin):
    list_display = ['user', 'month', 'dia', 'ativo', 'tipo', 'contratos', 'pontos', 'resultado', 'status']
    list_filter = ['month', 'ativo', 'status', 'user']
    search_fields = ['user__username']


@admin.register(DiarioEntry)
class DiarioEntryAdmin(admin.ModelAdmin):
    list_display = ['user', 'month', 'created_at', 'conteudo']
    list_filter = ['month', 'user']


@admin.register(Regra)
class RegraAdmin(admin.ModelAdmin):
    list_display = ['user', 'ordem', 'texto']
    list_filter = ['user']
