from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from decimal import Decimal
from datetime import date, timedelta

from .models import PlanilhaConfig, ProjecaoDia, Operacao, DiarioEntry, Regra
from .serializers import (
    PlanilhaConfigSerializer, ProjecaoDiaSerializer,
    OperacaoSerializer, DiarioEntrySerializer, RegraSerializer,
)


def get_period_info(period):
    today = date.today()
    days = {'30d': 30, '3m': 90, '6m': 180, '1y': 365}.get(period)
    if days:
        start = today - timedelta(days=days)
        months = set()
        current = start
        while current <= today:
            months.add(f"{current.year}-{current.month:02d}")
            current = current.replace(day=1) + timedelta(days=32)
            current = current.replace(day=1)
        return start, list(months)
    else:
        # assume it's month format
        return None, [period]


class PlanilhaConfigViewSet(viewsets.ModelViewSet):
    serializer_class = PlanilhaConfigSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PlanilhaConfig.objects.filter(user=self.request.user)
        month = self.request.query_params.get('month')
        if month:
            _, months = get_period_info(month)
            if months:
                qs = qs.filter(month__in=months)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='upsert')
    def upsert(self, request):
        """Cria ou atualiza o config do mês."""
        month = request.data.get('month')
        if not month:
            return Response({'error': 'month é obrigatório'}, status=400)

        obj, _ = PlanilhaConfig.objects.get_or_create(user=request.user, month=month)
        serializer = PlanilhaConfigSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=200)


class ProjecaoDiaViewSet(viewsets.ModelViewSet):
    serializer_class = ProjecaoDiaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ProjecaoDia.objects.filter(user=self.request.user)
        month = self.request.query_params.get('month')
        if month:
            _, months = get_period_info(month)
            if months:
                qs = qs.filter(month__in=months)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_upsert(self, request):
        """
        Salva vários dias de uma vez.
        Recebe lista de {month, dia, realizado, custo_op, imposto_retido}.
        """
        items = request.data
        if not isinstance(items, list):
            return Response({'error': 'Envie uma lista de dias.'}, status=400)

        results = []
        with transaction.atomic():
            for item in items:
                month = item.get('month')
                dia = item.get('dia')
                if not month or dia is None:
                    continue
                obj, _ = ProjecaoDia.objects.get_or_create(
                    user=request.user, month=month, dia=dia
                )
                serializer = ProjecaoDiaSerializer(obj, data=item, partial=True)
                if serializer.is_valid():
                    serializer.save()
                    results.append(serializer.data)
                else:
                    return Response(serializer.errors, status=400)

        return Response(results, status=200)

    @action(detail=False, methods=['get'], url_path='capital-atual')
    def capital_atual(self, request):
        """
        Retorna o capital_final do último dia realizado do período,
        ou a banca_inicial se não houver nenhum dia realizado.
        """
        month = request.query_params.get('month')
        if not month:
            return Response({'error': 'month é obrigatório'}, status=400)

        _, months = get_period_info(month)

        # Último dia com capital_final calculado no período
        ultimo_dia = (
            ProjecaoDia.objects
            .filter(user=request.user, month__in=months, capital_final__isnull=False)
            .order_by('-month', '-dia')
            .first()
        )

        if ultimo_dia:
            capital_final = ultimo_dia.capital_final
        else:
            # Fallback: retorna banca_inicial do config do mês atual
            current_month = f"{date.today().year}-{date.today().month:02d}"
            try:
                config = PlanilhaConfig.objects.get(user=request.user, month=current_month)
                capital_final = config.banca_inicial
            except PlanilhaConfig.DoesNotExist:
                capital_final = Decimal('0')

        return Response({
            'month': month,
            'capital_final': capital_final,
            'dia_referencia': ultimo_dia.dia if ultimo_dia else None,
        })


class OperacaoViewSet(viewsets.ModelViewSet):
    serializer_class = OperacaoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Operacao.objects.filter(user=self.request.user)
        month = self.request.query_params.get('month')
        if month:
            start, months = get_period_info(month)
            if start:
                qs = qs.filter(data_cal__gte=start)
            else:
                qs = qs.filter(month__in=months)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='bulk-sync')
    def bulk_sync(self, request):
        """
        Sincroniza operações de um mês completo.
        Recebe: { month: "2026-04", operacoes: [...] }

        Estratégia:
        1. Deleta as operações antigas do mês (substitui, não acumula).
        2. Creates novas operações (sem disparar signals N vezes).
        3. Faz UM único recálculo de ProjecaoDia para cada dia afetado.
        """
        month = request.data.get('month')
        operacoes_data = request.data.get('operacoes', [])

        if not month:
            return Response({'error': 'month é obrigatório'}, status=400)

        if not isinstance(operacoes_data, list):
            return Response({'error': 'operacoes deve ser uma lista'}, status=400)

        with transaction.atomic():
            # 1. Deleta operações antigas do mês (SIMPLES E SEGURO)
            Operacao.objects.filter(user=request.user, month=month).delete()

            # 2. Cria novas operações com bulk_create (sem disparar signals N vezes)
            created = []
            erros = []
            ops_para_criar = []
            
            for op in operacoes_data:
                op_data = {**op, 'month': month}
                serializer = OperacaoSerializer(data=op_data)
                if serializer.is_valid():
                    # Adiciona user ao validated_data (serializer exclui user)
                    validated_op = {**serializer.validated_data, 'user': request.user}
                    ops_para_criar.append(validated_op)
                    created.append(serializer.data)
                else:
                    erros.append({'data': op, 'errors': serializer.errors})

            if erros:
                # Rollback automático pelo transaction.atomic()
                return Response({'errors': erros}, status=400)

            # bulk_create sem disparar signals a cada insert
            if ops_para_criar:
                Operacao.objects.bulk_create(
                    [Operacao(**op) for op in ops_para_criar],
                    batch_size=100
                )

            # 3. Recálculo ÚNICO: agrupa por dia (EXCLUINDO ZERADA) e atualiza ProjecaoDia
            from .models import recalcular_cadeia
            from collections import defaultdict

            totais_por_dia = defaultdict(Decimal)
            for op in Operacao.objects.filter(user=request.user, month=month).exclude(status='ZERADA'):
                totais_por_dia[op.dia] += op.resultado or Decimal('0')

            # Atualiza/cria ProjecaoDia para cada dia presente nas operações
            dias_afetados = sorted(totais_por_dia.keys())
            for dia in dias_afetados:
                projecao_dia, _ = ProjecaoDia.objects.get_or_create(
                    user=request.user, month=month, dia=dia
                )
                ProjecaoDia.objects.filter(pk=projecao_dia.pk).update(
                    realizado=totais_por_dia[dia]
                )

            # Recalcula cadeia a partir do menor dia afetado
            if dias_afetados:
                recalcular_cadeia(request.user, month, dias_afetados[0])

        return Response(created, status=200)


class DiarioEntryViewSet(viewsets.ModelViewSet):
    serializer_class = DiarioEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = DiarioEntry.objects.filter(user=self.request.user)
        month = self.request.query_params.get('month')
        if month:
            start, _ = get_period_info(month)
            if start:
                qs = qs.filter(created_at__date__gte=start)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RegraViewSet(viewsets.ModelViewSet):
    serializer_class = RegraSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Regra.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='bulk-sync')
    def bulk_sync(self, request):
        """Sincroniza todas as regras do usuário."""
        regras = request.data if isinstance(request.data, list) else []
        with transaction.atomic():
            Regra.objects.filter(user=request.user).delete()
            created = []
            for i, regra in enumerate(regras):
                regra_data = {**regra, 'ordem': i}
                serializer = RegraSerializer(data=regra_data)
                if serializer.is_valid():
                    serializer.save(user=request.user)
                    created.append(serializer.data)
        return Response(created, status=200)
