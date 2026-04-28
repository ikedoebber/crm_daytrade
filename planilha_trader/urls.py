from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('accounts.urls')),
    path('api/', include('accounts.planilha.api_urls')),
    path('api/', include('ai.api_urls')),
    path('', include('accounts.planilha.urls')),
]
