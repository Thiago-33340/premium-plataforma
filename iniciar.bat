@echo off
title Premium Pizzas - Plataforma de Pedidos
cd /d "%~dp0"
echo.
echo   ==========================================
echo    PREMIUM PIZZAS - Plataforma de Pedidos
echo   ==========================================
echo.
echo   Iniciando servidor...
echo   Cliente:        http://localhost:8080/loja
echo   Estabelecimento http://localhost:8080/gestor
echo.
start "" http://localhost:8080/gestor
node server.js
pause
