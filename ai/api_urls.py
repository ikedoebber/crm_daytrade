from django.urls import path
from .views import invoke_agent

urlpatterns = [
    path('agent/invoke/', invoke_agent, name='invoke_agent'),
]
