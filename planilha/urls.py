from django.urls import path
from . import views


urlpatterns = [
    path('', views.planilha_view, name='planilha'),
]
