from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required
def planilha_view(request):
    return render(request, 'planilha/planilha.html', {
        'username': request.user.username,
    })
