from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required
def abertura_view(request):
    return render(request, 'abertura/abertura.html')
