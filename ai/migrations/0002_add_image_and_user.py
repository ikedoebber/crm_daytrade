# Generated migration for adding image and user fields to AIResult

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ai', '0001_add_image_and_user'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='airesult',
            name='image',
            field=models.ImageField(blank=True, null=True, upload_to='ai_analysis/'),
        ),
        migrations.AddField(
            model_name='airesult',
            name='user',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ai_results', to=settings.AUTH_USER_MODEL),
        ),
    ]
