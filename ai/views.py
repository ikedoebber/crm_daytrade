from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from ai.agent import SGEAgent
import json
import logging

logger = logging.getLogger(__name__)


@login_required
@require_POST
def invoke_agent(request):
    """Invoca o agente AI para análise de trading com ou sem imagem"""
    try:
        agent = SGEAgent()
        
        # Extrai imagem se fornecida
        image_file = request.FILES.get('image', None)
        
        # Invoca o agent e obtém resultado
        result = agent.invoke(image_file=image_file)
        
        # Cria registro no banco com resultado e imagem
        from ai.models import AIResult
        ai_result = AIResult.objects.create(
            user=request.user,
            result=result,
            image=image_file if image_file else None
        )
        
        return JsonResponse({
            'success': True,
            'result': ai_result.result,
            'created_at': ai_result.created_at.isoformat(),
            'image_url': ai_result.image.url if ai_result.image else None,
        })
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Erro ao invocar agente: {error_msg}", exc_info=True)
        return JsonResponse({
            'success': False,
            'error': error_msg,
        }, status=400)
