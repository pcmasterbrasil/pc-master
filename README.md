# PC MASTER

Aplicação web para sugerir configurações de computador com peças novas vendidas no Brasil, usando orçamento, finalidade e prioridade.

## Site

https://pcmasterbrasil.github.io/pc-master/

## Como funciona

- `index.html`: interface web.
- `motor.js`: gera combinações e aplica verificações de compatibilidade.
- `catalogo.json`: produtos, especificações, ofertas e datas de consulta.
- `scripts/sync-prices.mjs`: sincroniza preços de um feed autorizado.
- `.github/workflows/atualizar-precos.yml`: valida o motor e agenda a atualização a cada 6 horas.
- `tests/motor.test.mjs`: testes automatizados do gerador.

## Regras de recomendação

O gerador só considera ofertas com preço positivo, URL HTTPS, produto novo, estoque confirmado e consulta feita nos últimos 7 dias. Ele limita o resultado a até 10 configurações e rejeita combinações incompatíveis com os dados técnicos cadastrados.

O catálogo atual ainda está em construção. Produtos sem oferta validada não aparecem nas recomendações. Não publique nem venda o serviço como pronto antes de ampliar o catálogo e concluir testes reais de montagem.

## Ativar atualização automática de preços

O site do GitHub Pages é estático. A rotina de atualização é executada pelo GitHub Actions e precisa de uma API/feed ao qual o proprietário tenha acesso autorizado.

Consulte [docs/FEED-DE-PRECOS.md](docs/FEED-DE-PRECOS.md) para configurar:
- `PCMASTER_OFFERS_FEED_URL` para um feed JSON no formato PC MASTER; ou
- `PCMASTER_AWIN_FEED_URL`, `PCMASTER_AWIN_BEARER_TOKEN` e `PCMASTER_AWIN_STORE_NAME` para um feed Awin autorizado.

As credenciais devem ser cadastradas em **Settings → Secrets and variables → Actions**. Nunca coloque chaves no código ou no catálogo.

## Testes

O workflow executa:

```bash
node --check motor.js
node --check scripts/sync-prices.mjs
node tests/motor.test.mjs
```

Também é possível executar os comandos localmente com Node.js 22 ou superior.

## O que ainda depende do proprietário

1. Criar conta e obter acesso a um feed/API autorizado (por exemplo, Awin e anunciantes participantes).
2. Cadastrar os segredos privados no GitHub.
3. Ampliar o catálogo com produtos, especificações, fontes e ofertas verificadas.
4. Conferir a lista de suporte de CPU/BIOS da revisão exata de cada placa-mãe.
5. Fazer testes de compra e de compatibilidade com as lojas antes de liberar o produto comercialmente.

A integração não faz scraping de lojas e não tenta contornar termos de uso. Sem feed conectado, a rotina executa as verificações, mas não inventa nem atualiza preços.
