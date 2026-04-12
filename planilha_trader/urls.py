from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('accounts.urls')),
    path('api/', include('planilha.api_urls')),
    path('', include('planilha.urls')),
]
