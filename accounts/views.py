from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib import messages


def login_view(request):
    if request.user.is_authenticated:
        return redirect('planilha')
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return redirect(request.GET.get('next', 'planilha'))
        messages.error(request, 'Usuário ou senha inválidos.')
    return render(request, 'accounts/login.html')


def logout_view(request):
    if request.method == 'POST':
        logout(request)
    return redirect('login')


def register_view(request):
    if request.user.is_authenticated:
        return redirect('planilha')
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password1 = request.POST.get('password1', '')
        password2 = request.POST.get('password2', '')
        email = request.POST.get('email', '').strip()

        if not username or not password1:
            messages.error(request, 'Preencha todos os campos.')
        elif password1 != password2:
            messages.error(request, 'As senhas não coincidem.')
        elif User.objects.filter(username=username).exists():
            messages.error(request, 'Este usuário já existe.')
        else:
            user = User.objects.create_user(username=username, email=email, password=password1)
            login(request, user)
            return redirect('planilha')
    return render(request, 'accounts/register.html')
