# Lovable Credit Freeze Extension

Esta é uma extensão do Chrome que permite congelar créditos no serviço Lovable, impedindo o consumo de créditos durante o uso.

## Funcionalidades

- Impede o consumo de créditos no Lovable
- Interface de usuário simples através do popup
- Indicador visual de que os créditos estão congelados
- Bloqueia requisições de consumo de créditos

## Instalação

1. Clone este repositório ou baixe os arquivos
2. Abra o Chrome e vá para `chrome://extensions/`
3. Ative o modo "Desenvolvedor"
4. Clique em "Carregar extensão não empacotada"
5. Selecione a pasta `lovable_freeze_extension`

## Como usar

1. Após instalar, clique no ícone da extensão na barra de ferramentas
2. Clique em "Congelar Créditos" para ativar o bloqueio
3. O overlay vermelho aparecerá na página do Lovable indicando que os créditos estão congelados
4. Para desativar, clique em "Descongelar Créditos"

## Arquivos

- `manifest.json` - Configuração da extensão
- `content.js` - Script injetado na página do Lovable para interceptar chamadas de créditos
- `popup.html` e `popup.js` - Interface do popup da extensão
- `styles.css` - Estilos para o overlay de congelamento

## Observações

Esta extensão é uma implementação experimental e pode não funcionar com todas as versões do Lovable. É importante lembrar que o uso de extensões para contornar políticas de uso pode violar os termos de serviço do serviço.

## Desenvolvimento

Para contribuir com o desenvolvimento desta extensão:

1. Faça um fork do repositório
2. Crie uma branch para suas alterações
3. Faça commits com mensagens descritivas
4. Envie um pull request