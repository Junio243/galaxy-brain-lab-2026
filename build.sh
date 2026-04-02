#!/bin/bash

echo "=============================================="
echo "Build da Extensão Lovable Credit Freeze"
echo "=============================================="
echo ""

# Remover build anterior se existir
rm -rf dist/
mkdir -p dist

# Copiar todos os arquivos necessários
echo "Copiando arquivos..."
cp manifest.json dist/
cp content.bundle.js dist/content.js
cp popup.html dist/
cp popup.js dist/
cp styles.css dist/
cp README.md dist/

# Copiar diretórios completos
cp -r lib dist/
cp -r background dist/
cp -r icons dist/
cp -r offscreen dist/

# O conteúdo do content/ já está bundificado, mas mantemos para web_accessible_resources
cp -r content dist/

echo ""
echo "Arquivos copiados:"
find dist -type f | sort

echo ""
echo "=============================================="
echo "Build concluído com sucesso!"
echo "=============================================="
echo ""
echo "A extensão está pronta na pasta: dist/"
echo ""
echo "PARA TESTAR NO CHROME:"
echo "----------------------"
echo "1. Abra o Chrome e vá para chrome://extensions/"
echo "2. Ative o 'Modo do desenvolvedor' (canto superior direito)"
echo "3. Clique em 'Carregar sem compactação'"
echo "4. Selecione a pasta 'dist' deste projeto"
echo ""
echo "PARA EMPACOTAR (opcional):"
echo "--------------------------"
echo "zip -r lovable_credit_freeze_extension.zip dist/"
echo ""
