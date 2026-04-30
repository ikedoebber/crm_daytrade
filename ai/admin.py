from django.contrib import admin
from . import models


class AIResultAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'user', 'has_image', 'result_preview',)
    list_filter = ('created_at', 'user',)
    search_fields = ('user__username', 'result',)
    readonly_fields = ('created_at',)
    
    def has_image(self, obj):
        return '✓ Sim' if obj.image else '✗ Não'
    has_image.short_description = 'Tem Imagem'
    
    def result_preview(self, obj):
        preview = (obj.result[:100] + '...') if obj.result and len(obj.result) > 100 else obj.result or 'Sem resultado'
        return preview
    result_preview.short_description = 'Resultado'


admin.site.register(models.AIResult, AIResultAdmin)