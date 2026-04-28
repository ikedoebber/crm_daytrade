from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from ai.agent import SGEAgent
import json


@login_required
@require_POST
def invoke_agent(request):
    """Invoca o agente AI para análise de trading"""
    try:
        agent = SGEAgent()
        agent.invoke()
        
        # Busca o último resultado criado
        from ai.models import AIResult
        latest_result = AIResult.objects.latest('created_at')
        
        return JsonResponse({
            'success': True,
            'result': latest_result.result,
            'created_at': latest_result.created_at.isoformat(),
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e),
        }, status=400)
