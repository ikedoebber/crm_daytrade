from django.urls import path
from . import views


urlpatterns = [
    path('', views.abertura_view, name='abertura'),
]
