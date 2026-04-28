import json
from django.conf import settings
from django.core import serializers
from openai import OpenAI
from ai import prompts, models
from accounts.planilha.models import PlanilhaConfig, ProjecaoDia, Operacao, DiarioEntry


class SGEAgent:

    def __init__(self):
        self.__client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
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

    def invoke(self):
        response = self.__client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    'role': 'system',
                    'content': prompts.SYSTEM_PROMPT,
                },
                {
                    'role': 'user',
                    'content': prompts.USER_PROMPT.replace('{{data}}', self.__get_data()),
                },
            ],
        )
        result = response.choices[0].message.content
        models.AIResult.objects.create(result=result)