# Correção dos Erros de Build - Chrome Extension

## Problema Identificado

Os erros ocorriam porque:

1. **ES Modules no Content Scripts**: O arquivo `content.js` original usava sintaxe ES6 (`import`/`export`), que não é suportada nativamente por content scripts do Chrome (a menos que configure `type: "module"` no manifest, o que causa mais problemas).

2. **Múltiplos Arquivos de Conteúdo**: O manifest referenciava 12 arquivos separados na pasta `content/`, criando dependências complexas e possíveis problemas de ordem de carregamento.

3. **dexie.min.js**: A versão baixada pode estar em formato ESM puro, incompatível com scripts comuns.

## Solução Implementada

### 1. Criado Bundle Único (`content.bundle.js`)

Um arquivo JavaScript único que:
- Não usa `import`/`export`
- Inline todas as dependências principais (CRDT Engine, Session Manager, Credit Freeze)
- Usa padrão IIFE (Immediately Invoked Function Expression) para isolamento
- Expõe APIs via `window` object para comunicação entre módulos

### 2. Manifest Atualizado

O `manifest.json` agora referencia apenas:
```json
"content_scripts": [{
  "js": ["lib/dexie.min.js", "content.bundle.js"]
}]
```

### 3. Build Script Melhorado

O `build.sh` agora:
- Copia todos os arquivos necessários para `dist/`
- Usa `content.bundle.js` como `content.js` no build
- Mantém a pasta `content/` original para referência e `web_accessible_resources`
- Fornece instruções claras de como testar

## Como Usar

### Testar no Chrome

1. Execute o build:
   ```bash
   ./build.sh
   ```

2. No Chrome:
   - Acesse `chrome://extensions/`
   - Ative o "Modo do desenvolvedor"
   - Clique em "Carregar sem compactação"
   - Selecione a pasta `dist/`

### Estrutura do Build

```
dist/
├── manifest.json          # Configuração da extensão
├── content.js             # Bundle principal (content.bundle.js copiado)
├── popup.html             # UI do popup
├── popup.js               # Lógica do popup
├── styles.css             # Estilos
├── lib/
│   └── dexie.min.js       # IndexedDB wrapper
├── background/
│   └── service-worker.js  # Service worker (usa type: module)
├── content/               # Módulos originais (para referência)
├── icons/                 # Ícones da extensão
└── offscreen/             # Documentos offscreen
```

## Notas Técnicas

### Por Que o Bundle Funciona?

1. **Sem ES Modules**: Tudo está em escopo global ou dentro de IIFEs
2. **Ordem de Carregamento Controlada**: O bundle carrega na ordem correta
3. **Compatibilidade**: Funciona em qualquer Chrome moderno sem configurações especiais

### Service Worker Continua com Modules

O `background/service-worker.js` mantém `"type": "module"` no manifest porque:
- Service workers têm melhor suporte a ES modules
- Não afeta os content scripts
- Permite usar imports modernos no background

## Próximos Passos (Opcional)

Se quiser um build mais robusto no futuro:

1. **Usar um Bundler Real**: Webpack, Vite, ou esbuild
2. **TypeScript**: Adicionar type checking
3. **Tree Shaking**: Remover código não utilizado
4. **Minificação**: Reduzir tamanho do bundle

## Troubleshooting

### Erro: "Cannot use import statement outside a module"

**Causa**: Arquivo de content script usando `import`

**Solução**: Use o `content.bundle.js` que não tem imports

### Erro: "export is not defined"

**Causa**: Arquivo tentando usar `export` em script comum

**Solução**: Mesmo caso acima - use o bundle

### Extensão Não Carrega

1. Verifique o console do Chrome (`chrome://extensions/`)
2. Veja se há erros específicos
3. Confirme que `dist/content.js` existe e é válido

