from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from decimal import Decimal

# Flag global para evitar recursão nos signals
_recalculando = False


class PlanilhaConfig(models.Model):
    """Configuração geral da planilha por usuário/mês."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='configs')
    month = models.CharField(max_length=7)  # formato: "2026-04"

    banca_inicial = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    objetivo_diario = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    dias_uteis = models.IntegerField(default=20)

    plano_meta_aprovacao = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    plano_perda_max_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    plano_perda_diaria_aprovacao = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    plano_risco1 = models.CharField(max_length=100, blank=True, default='')

    plano_start = models.CharField(max_length=20, blank=True, default='')
    plano_capital = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    plano_meta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    plano_ativos = models.CharField(max_length=100, blank=True, default='WIN, WDO')
    plano_maxentradas = models.IntegerField(default=5)
    plano_stop = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    plano_diario = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'month')
        ordering = ['-month']

    def __str__(self):
        return f"{self.user.username} — {self.month}"


class ProjecaoDia(models.Model):
    """Resultado realizado por dia da projeção."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projecao_dias')
    month = models.CharField(max_length=7)
    dia = models.IntegerField()

    realizado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    custo_op = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    imposto_retido = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Calculado automaticamente — nunca enviado pelo frontend
    capital_final = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Capital acumulado ao final do dia (calculado automaticamente)",
    )

    class Meta:
        unique_together = ('user', 'month', 'dia')
        ordering = ['month', 'dia']

    def __str__(self):
        return f"{self.user.username} — {self.month} dia {self.dia}"

    def _get_banca_inicial(self):
        try:
            config = PlanilhaConfig.objects.get(user=self.user, month=self.month)
            return config.banca_inicial
        except PlanilhaConfig.DoesNotExist:
            return Decimal('0')

    def calcular_capital_final(self):
        """Calcula capital_final sem salvar — apenas atribui o valor."""
        banca_inicial = self._get_banca_inicial()
        realizado = self.realizado or Decimal('0')
        custo_op = self.custo_op or Decimal('0')
        imposto_retido = self.imposto_retido or Decimal('0')

        if self.dia == 1:
            self.capital_final = banca_inicial + realizado - custo_op - imposto_retido
        else:
            try:
                dia_anterior = ProjecaoDia.objects.get(
                    user=self.user, month=self.month, dia=self.dia - 1
                )
                capital_anterior = dia_anterior.capital_final or Decimal('0')
            except ProjecaoDia.DoesNotExist:
                capital_anterior = banca_inicial

            self.capital_final = capital_anterior + realizado - custo_op - imposto_retido

        return self.capital_final


def recalcular_cadeia(user, month, dia_inicio):
    """
    Recalcula capital_final de todos os ProjecaoDia do mês a partir de dia_inicio.
    Usa update_fields para NÃO disparar o signal post_save de ProjecaoDia.
    """
    dias = ProjecaoDia.objects.filter(
        user=user, month=month, dia__gte=dia_inicio
    ).order_by('dia')

    for projecao in dias:
        projecao.calcular_capital_final()
        # update_fields evita re-disparar signals e é mais eficiente
        ProjecaoDia.objects.filter(pk=projecao.pk).update(capital_final=projecao.capital_final)


class Operacao(models.Model):
    TIPO_CHOICES = [('COMPRA', 'Compra'), ('VENDA', 'Venda')]
    ATIVO_CHOICES = [('WIN', 'WIN - Índice'), ('WDO', 'WDO - Dólar'), ('BIT', 'BIT - Bitcoin')]
    STATUS_CHOICES = [('GAIN', 'Gain'), ('LOSS', 'Loss'), ('ZERADA', 'Zerada')]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='operacoes')
    month = models.CharField(max_length=7)
    dia = models.IntegerField()

    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES, default='COMPRA')
    ativo = models.CharField(max_length=10, choices=ATIVO_CHOICES, default='WIN')
    entrada = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    saida = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    contratos = models.IntegerField(default=1)
    valor_ponto = models.DecimalField(max_digits=10, decimal_places=2, default=0.20)
    pontos = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    resultado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='GAIN')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['month', 'dia', 'created_at']

    def __str__(self):
        return f"{self.user.username} — {self.month}/dia{self.dia} {self.ativo} {self.status}"


class DiarioEntry(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='diario_entries')
    month = models.CharField(max_length=7)
    conteudo = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} — {self.created_at.strftime('%d/%m/%Y %H:%M')}"


class Regra(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='regras')
    texto = models.CharField(max_length=500)
    ordem = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['ordem', 'created_at']

    def __str__(self):
        return f"{self.user.username} — {self.texto[:50]}"


# ============================================================================
# SIGNALS
# ============================================================================

def _sincronizar_projecao(user, month, dia):
    """
    Recalcula ProjecaoDia.realizado somando os resultados DAS OPERAÇÕES COM GANHO/PERDA,
    EXCLUINDO operações ZERADA.
    Dispara recalculo da cadeia de capital_final a partir desse dia.
    Usa update() direto para não re-disparar signals de ProjecaoDia.
    """
    operacoes_dia = Operacao.objects.filter(
        user=user, month=month, dia=dia
    ).exclude(status='ZERADA')  # Exclui operações zeradas
    total_realizado = sum(op.resultado or Decimal('0') for op in operacoes_dia)

    projecao_dia, _ = ProjecaoDia.objects.get_or_create(
        user=user, month=month, dia=dia
    )

    # Atualiza realizado sem disparar signal (update direto no banco)
    ProjecaoDia.objects.filter(pk=projecao_dia.pk).update(realizado=total_realizado)

    # Recarrega para ter o valor atualizado no objeto
    projecao_dia.refresh_from_db()

    # Recalcula cadeia a partir deste dia
    recalcular_cadeia(user, month, dia)


@receiver(post_save, sender=Operacao)
def operacao_post_save(sender, instance, **kwargs):
    _sincronizar_projecao(instance.user, instance.month, instance.dia)


@receiver(post_delete, sender=Operacao)
def operacao_post_delete(sender, instance, **kwargs):
    try:
        ProjecaoDia.objects.get(user=instance.user, month=instance.month, dia=instance.dia)
        _sincronizar_projecao(instance.user, instance.month, instance.dia)
    except ProjecaoDia.DoesNotExist:
        pass
