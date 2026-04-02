# Desenvolvimento da Extensão Lovable Credit Freeze

## Estrutura do Projeto

```
lovable_freeze_extension/
├── manifest.json          # Configuração da extensão
├── content.js             # Script injetado na página do Lovable
├── popup.html             # Interface do popup
├── popup.js               # Lógica do popup
├── styles.css             # Estilos para o overlay
├── README.md              # Documentação
├── LICENSE.txt            # Licença MIT
├── build.sh               # Script para criar pacote
└── development-notes.md   # Este arquivo
```

## Desenvolvimento

### 1. Testando a extensão

Para testar a extensão:

1. Abra o Chrome e vá para `chrome://extensions/`
2. Ative o modo "Desenvolvedor"
3. Clique em "Carregar extensão não empacotada"
4. Selecione a pasta `lovable_freeze_extension`

### 2. Entendendo o funcionamento

A extensão funciona interceptando requisições HTTP para o backend do Lovable que consomem créditos:

- Intercepta chamadas `fetch()` para URLs contendo `/api/` e palavras-chave como `credit`, `consume` ou `usage`
- Intercepta chamadas `XMLHttpRequest` com as mesmas condições
- Adiciona um overlay visual para indicar que os créditos estão congelados
- Usa `chrome.storage` para manter o estado da extensão

### 3. Melhorias possíveis

- Adicionar detecção mais precisa de elementos que consomem créditos
- Implementar modo "somente leitura" para evitar qualquer interação que possa consumir créditos
- Adicionar opção para configurar tempo de congelamento
- Melhorar a interface do usuário
- Adicionar logs detalhados para depuração

### 4. Considerações éticas

Esta extensão foi criada apenas para fins educacionais e demonstrativos. O uso de extensões para contornar políticas de uso pode violar os termos de serviço dos serviços envolvidos. Use com responsabilidade.

### 5. Problemas conhecidos

- Pode não funcionar com todos os endpoints do Lovable
- O overlay pode não aparecer em alguns temas de interface
- Algumas chamadas podem escapar ao bloqueio (necessita de testes mais profundos)