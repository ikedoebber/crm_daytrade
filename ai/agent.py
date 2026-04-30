import json
import base64
import logging
import mimetypes
from django.conf import settings
from django.core import serializers
from openai import OpenAI
from ai import prompts, models
from accounts.planilha.models import PlanilhaConfig, ProjecaoDia, Operacao, DiarioEntry

logger = logging.getLogger(__name__)


class SGEAgent:

    def __init__(self):
        self.__client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=120.0,  # Timeout de 2 minutos para requisições
        )

    def __get_data(self):
        planilhas = PlanilhaConfig.objects.all()
        projecoes = ProjecaoDia.objects.all()
        operacoes = Operacao.objects.all()
        diarios = DiarioEntry.objects.all()
        
        return json.dumps({
            'planilhas': serializers.serialize('json', planilhas),
            'projecoes': serializers.serialize('json', projecoes),
            'operacoes': serializers.serialize('json', operacoes),
            'diarios': serializers.serialize('json', diarios),
        })

    @staticmethod
    def __get_image_media_type(image_file):
        """Detecta o tipo MIME do arquivo de imagem"""
        filename = image_file.name if hasattr(image_file, 'name') else 'image.jpg'
        mime_type, _ = mimetypes.guess_type(filename)
        # Fallback para JPEG se não conseguir detectar
        return mime_type or 'image/jpeg'

    @staticmethod
    def __encode_image_to_base64(image_file):
        """Converte arquivo de imagem para base64"""
        try:
            image_file.seek(0)
            image_data = image_file.read()
            return base64.b64encode(image_data).decode('utf-8')
        except Exception as e:
            logger.error(f"Erro ao codificar imagem: {e}", exc_info=True)
            return None

    def invoke(self, image_file=None):
        """
        Invoca o agente com análise opcional de imagem
        
        Args:
            image_file: arquivo de imagem (opcional)
        """
        try:
            messages = [
                {
                    'role': 'system',
                    'content': prompts.SYSTEM_PROMPT,
                },
            ]

            # Prepara conteúdo do usuário com ou sem imagem
            user_content = []
            
            # Adiciona texto com dados
            user_content.append({
                'type': 'text',
                'text': prompts.USER_PROMPT.replace('{{data}}', self.__get_data())
            })

            # Adiciona imagem se fornecida
            if image_file:
                logger.info(f"Processando imagem: {image_file.name}")
                image_base64 = self.__encode_image_to_base64(image_file)
                if image_base64:
                    media_type = self.__get_image_media_type(image_file)
                    logger.info(f"Tipo de imagem detectado: {media_type}")
                    
                    # Adiciona instrução para análise de gráfico
                    user_content.append({
                        'type': 'text',
                        'text': prompts.IMAGE_ANALYSIS_PROMPT
                    })
                    
                    # Adiciona imagem no formato correto para OpenAI Vision API
                    user_content.append({
                        'type': 'image_url',
                        'image_url': {
                            'url': f'data:{media_type};base64,{image_base64}',
                            'detail': 'high'
                        }
                    })
                    logger.info("Imagem adicionada ao conteúdo")

            messages.append({
                'role': 'user',
                'content': user_content
            })

            logger.info(f"Invocando API OpenAI com modelo {settings.OPENAI_MODEL}")
            response = self.__client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages,
                max_completion_tokens=2000,
            )
            result = response.choices[0].message.content
            logger.info("Resposta da API recebida com sucesso")
            return result
        except Exception as e:
            logger.error(f"Erro ao invocar agente: {e}", exc_info=True)
            raise