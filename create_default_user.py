import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'planilha_trader.settings')
import django

django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('Created default admin/admin123')
else:
    print('Default admin user already exists')
