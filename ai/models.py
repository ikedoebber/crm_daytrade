from django.db import models
from django.contrib.auth.models import User


class AIResult(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_results', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    result = models.TextField(null=True, blank=True)
    image = models.ImageField(upload_to='ai_analysis/', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']