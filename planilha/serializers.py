from rest_framework import serializers
from .models import PlanilhaConfig, ProjecaoDia, Operacao, DiarioEntry, Regra


class PlanilhaConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanilhaConfig
        exclude = ['user']
        read_only_fields = ['created_at', 'updated_at']


class ProjecaoDiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjecaoDia
        exclude = ['user']
        # capital_final é editable=False no model — precisa estar explícito aqui
        read_only_fields = ['capital_final']


class OperacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Operacao
        exclude = ['user']
        read_only_fields = ['created_at']


class DiarioEntrySerializer(serializers.ModelSerializer):
    created_at_fmt = serializers.SerializerMethodField()

    class Meta:
        model = DiarioEntry
        exclude = ['user']
        read_only_fields = ['created_at']

    def get_created_at_fmt(self, obj):
        return obj.created_at.strftime('%d/%m/%Y %H:%M')


class RegraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Regra
        exclude = ['user']
        read_only_fields = ['created_at']
