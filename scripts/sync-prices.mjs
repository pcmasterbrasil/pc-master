import fs from "node:fs/promises";

const catalogPath = new URL("../catalogo.json", import.meta.url);
const feedUrl = process.env.PCMASTER_OFFERS_FEED_URL;

if (!feedUrl) {
  console.log("Feed não configurado. Nenhuma oferta foi alterada.");
  process.exit(0);
}

if (!/^https:\/\//i.test(feedUrl)) {
  throw new Error("O feed precisa usar HTTPS.");
}

const response = await fetch(feedUrl, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error(`Feed respondeu HTTP ${response.status}. Catálogo preservado.`);

const feed = await response.json();
if (!feed || !Array.isArray(feed.offers)) {
  throw new Error("Formato inválido: esperado um objeto JSON com uma lista offers[]. Catálogo preservado.");
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const known = new Map((catalog.products || []).map(p => [p.id, p]));
const now = new Date();
const today = now.toISOString().slice(0, 10);
const maxAgeDays = 7;
const accepted = new Map();
const rejected = [];

for (const item of feed.offers) {
  const product = known.get(item.productId);
  const price = Number(item.price);
  const valid =
    product &&
    typeof item.store === "string" && item.store.trim() &&
    Number.isFinite(price) && price > 0 &&
    typeof item.url === "string" && /^https:\/\//i.test(item.url) &&
    item.condition === "new" &&
    item.inStock === true;

  if (!valid) {
    rejected.push(item.productId || "oferta sem productId");
    continue;
  }

  const offer = {
    store: item.store.trim(),
    price,
    currency: "BRL",
    url: item.url,
    checkedAt: today,
    checkedAtTime: now.toISOString(),
    condition: "new",
    inStock: true
  };
  if (item.paymentNote) offer.paymentNote = String(item.paymentNote).slice(0, 300);
  if (item.seller) offer.seller = String(item.seller).slice(0, 120);

  const list = accepted.get(item.productId) || [];
  list.push(offer);
  accepted.set(item.productId, list);
}

// Atualiza apenas produtos presentes no feed. Produtos ausentes mantêm as ofertas
// anteriores, que o motor deixa de exibir automaticamente após 7 dias.
let updatedProducts = 0;
for (const [productId, offers] of accepted) {
  const product = known.get(productId);
  const unique = new Map();
  for (const offer of offers) {
    const key = `${offer.store}| ${offer.url}`;
    const current = unique.get(key);
    if (!current || offer.price < current.price) unique.set(key, offer);
  }
  product.offers = [...unique.values()].sort((a, b) => a.price - b.price);
  product.researchStatus = "validated_offer";
  updatedProducts++;
}

if (updatedProducts === 0) {
  throw new Error("Nenhuma oferta válida recebida. Catálogo preservado.");
}

catalog.lastPriceSyncAt = now.toISOString();
catalog.priceSync = {
  status: "success",
  source: "authorized_partner_feed",
  updatedProducts,
  acceptedOffers: [...accepted.values()].reduce((n, list) => n + list.length, 0),
  rejectedOffers: rejected.length
};

await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Catálogo atualizado: ${updatedProducts} produtos. Ofertas rejeitadas: ${rejected.length}.`);
