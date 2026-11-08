# Integração automática de preços

O PC MASTER executa a rotina de sincronização a cada 6 horas pelo GitHub Actions. Também é possível executá-la manualmente na aba **Actions**.

## Importante

O GitHub Pages é um site estático: ele não consulta lojas nem executa tarefas em segundo plano por conta própria. A rotina usa GitHub Actions e precisa de um feed/API autorizado de um parceiro ou fornecedor de dados. Não há integração direta com lojas ativada por padrão, e a rotina não inventa preços.

## Configuração

1. Obtenha de uma loja, programa de afiliados ou fornecedor autorizado uma URL HTTPS que entregue JSON.
2. No repositório, abra **Settings → Secrets and variables → Actions → New repository secret**.
3. Crie o segredo `PCMASTER_OFFERS_FEED_URL` com a URL privada do feed.
4. Acesse **Actions → Atualizar preços do catálogo → Run workflow** para testar.

A URL deve retornar JSON neste formato:

```json
{
  "offers": [
    {
      "productId": "amd-ryzen-5-5500-100-100000457box",
      "store": "Nome da loja",
      "price": 599.9,
      "url": "https://www.loja.com.br/produto",
      "condition": "new",
      "inStock": true,
      "paymentNote": "Preço à vista no Pix"
    }
  ]
}
```

O `productId` precisa corresponder exatamente ao ID de um produto existente em `catalogo.json`. Cada item precisa ter preço positivo, URL HTTPS, produto novo e estoque confirmado.

## Regras de segurança

- Respostas HTTP com erro ou feed inválido não alteram o catálogo.
- Ofertas sem produto conhecido, preço, link HTTPS, condição nova ou estoque confirmado são rejeitadas.
- Produtos não enviados pelo feed não têm seus dados apagados; ofertas antigas deixam de ser recomendadas pelo motor depois de 7 dias.
- A rotina registra data/hora da última sincronização e quantidade de ofertas aceitas/rejeitadas.
- A integração deve respeitar os termos de uso e limites da fonte de dados.
