#!/bin/bash

echo "Criando pacote da extensão Lovable Credit Freeze..."

# Criar diretório temporário
mkdir -p temp_extension

# Copiar todos os arquivos necessários
cp manifest.json temp_extension/
cp content.js temp_extension/
cp popup.html temp_extension/
cp popup.js temp_extension/
cp styles.css temp_extension/
cp README.md temp_extension/

# Criar zip para distribuição
cd temp_extension
zip -r ../lovable_credit_freeze_extension.zip .

echo "Pacote criado: lovable_credit_freeze_extension.zip"
echo "Limpeza..."
cd ..
rm -rf temp_extension

echo "Pronto!"