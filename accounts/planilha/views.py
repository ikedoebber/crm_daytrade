from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from ai.models import AIResult


@login_required
def planilha_view(request):
    saved_analyses = AIResult.objects.filter(user=request.user).order_by('-created_at')[:10]
    return render(request, 'planilha/planilha.html', {
        'username': request.user.username,
        'saved_analyses': saved_analyses,
    })
