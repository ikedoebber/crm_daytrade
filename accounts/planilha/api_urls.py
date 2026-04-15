from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    PlanilhaConfigViewSet, ProjecaoDiaViewSet,
    OperacaoViewSet, DiarioEntryViewSet, RegraViewSet
)

router = DefaultRouter()
router.register(r'config', PlanilhaConfigViewSet, basename='config')
router.register(r'projecao', ProjecaoDiaViewSet, basename='projecao')
router.register(r'operacoes', OperacaoViewSet, basename='operacoes')
router.register(r'diario', DiarioEntryViewSet, basename='diario')
router.register(r'regras', RegraViewSet, basename='regras')

urlpatterns = [
    path('', include(router.urls)),
]
