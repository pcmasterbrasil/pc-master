# Integração automática de preços

O PC MASTER executa a rotina de sincronização a cada 6 horas pelo GitHub Actions. Também é possível executá-la manualmente em **Actions → Atualizar preços do catálogo → Run workflow**.

## O que falta para ativar

O site publicado no GitHub Pages é estático. A rotina de preços roda no GitHub Actions e precisa de uma fonte autorizada (API ou feed de uma loja/rede de afiliados). Nenhuma loja está conectada automaticamente neste momento.

## Opção A — Feed próprio/terceiro no formato PC MASTER

Cadastre o segredo `PCMASTER_OFFERS_FEED_URL` em **Settings → Secrets and variables → Actions → New repository secret**.

O endereço HTTPS deve retornar JSON neste formato:

```json
{
  "offers": [
    {
      "productId": "amd-ryzen-5-5500-100-100000457box",
      "store": "Nome da loja",
      "price": 599.90,
      "currency": "BRL",
      "url": "https://www.loja.com.br/produto",
      "condition": "new",
      "inStock": true
    }
  ]
}
```

## Opção B — Awin Enhanced Product Feed (JSONL)

A Awin oferece feeds de produtos com preço, link e disponibilidade para publishers que tenham acesso ao anunciante/feed. O PC MASTER aceita JSONL e cruza o MPN/GTIN com os identificadores exatos cadastrados em `catalogo.json`.

Configure estes segredos:

- `PCMASTER_AWIN_FEED_URL`: URL de download do feed JSONL Enhanced/Google.
- `PCMASTER_AWIN_BEARER_TOKEN`: token Bearer da API Awin.
- `PCMASTER_AWIN_STORE_NAME`: nome do anunciante/loja que aparece nos preços (não use o nome da marca do componente).

A URL e o token são obtidos na conta Awin, após ter acesso ao feed de um anunciante. O PC MASTER não consegue criar uma conta, aceitar termos ou obter aprovação em nome do proprietário.

Documentação oficial: [Awin — acesso a feeds de produtos](https://success.awin.com/articles/pt_BR/Knowledge/How-can-I-access-a-Product-Feed) e [Awin — Publisher Enhanced Feed API](https://help.awin.com/apidocs/retail-publisher-productapidocumentation-1).

## Validação e segurança

- Aceita apenas produto novo, estoque confirmado, preço positivo, moeda BRL e URL HTTPS.
- Faz correspondência por ID interno ou MPN/GTIN/SKU explicitamente cadastrado; não tenta adivinhar modelos semelhantes.
- Feed vazio, resposta HTTP com erro ou nenhuma oferta válida não alteram o catálogo.
- Registra data/hora da sincronização e contagem de ofertas aceitas/rejeitadas.
- Produtos não encontrados no feed mantêm o histórico, mas ofertas antigas deixam de ser recomendadas pelo motor após 7 dias.
- Nunca coloque tokens ou URLs privadas diretamente no código ou no catálogo. Use GitHub Secrets.
- O uso de qualquer feed deve respeitar os termos do programa e do anunciante.

## Amazon

A Amazon exige conta no Programa de Associados e aprovação/acesso próprio à API de publicidade de produtos. As credenciais precisam ser geradas pelo titular da conta; não há chave pública que o PC MASTER possa usar sem autorização. Consulte a [documentação oficial do Programa de Associados](https://associados.amazon.com.br/help/node/topic/GVJ2BJP35457CLML).
