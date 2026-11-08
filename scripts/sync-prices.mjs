import fs from "node:fs/promises";

const catalogPath = new URL("../catalogo.json", import.meta.url);
const feedUrl = process.env.PCMASTER_OFFERS_FEED_URL || process.env.PCMASTER_AWIN_FEED_URL;
if (!feedUrl) {
  console.log("Feed não configurado. Nenhuma oferta foi alterada.");
  process.exit(0);
}
if (!/^https:\/\//i.test(feedUrl)) throw new Error("O feed precisa usar HTTPS.");

const headers = { accept: "application/json, application/x-ndjson" };
if (process.env.PCMASTER_AWIN_BEARER_TOKEN) headers.authorization = `Bearer ${process.env.PCMASTER_AWIN_BEARER_TOKEN}`;
const response = await fetch(feedUrl, { headers, signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}. Catálogo preservado.`);

const raw = await response.text();
let feedOffers;
try {
  const parsed = JSON.parse(raw);
  feedOffers = Array.isArray(parsed.offers) ? parsed.offers : Array.isArray(parsed) ? parsed : null;
} catch {
  feedOffers = null;
}
if (!feedOffers) {
  try { feedOffers = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
  catch { throw new Error("Formato não reconhecido. Use JSON com offers[] ou JSONL autorizado."); }
}
if (!feedOffers.length) throw new Error("Feed vazio. Catálogo preservado.");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const known = new Map((catalog.products || []).map(p => [p.id, p]));
const byIdentifier = new Map();
for (const product of catalog.products || []) {
  for (const id of product.identifiers || []) byIdentifier.set(String(id).toLowerCase(), product);
}
const now = new Date();
const today = now.toISOString().slice(0, 10);
const accepted = new Map();
const outOfStock = new Map();
const rejected = [];
const parsePrice = value => {
  if (typeof value === "number") return value;
  const match = String(value || "").replace(",", ".").match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? Number(match[0]) : NaN;
};

for (const item of feedOffers) {
  let product = known.get(item.productId);
  if (!product) {
    const identifier = [item.mpn, item.gtin, item.product_GTIN, item.id].find(v => v && byIdentifier.has(String(v).toLowerCase()));
    if (identifier) product = byIdentifier.get(String(identifier).toLowerCase());
  }
  const store = item.store || item.merchant || item.advertiser || process.env.PCMASTER_AWIN_STORE_NAME;
  const price = parsePrice(item.price);
  const url = item.url || item.link || item.deep_link;
  const condition = String(item.condition || "").toLowerCase();
  const availability = String(item.availability || "").toLowerCase();
  const inStock = item.inStock === true || item.in_stock === "1" || item.in_stock === true || availability === "in_stock";
  if (product && typeof store === "string" && store.trim() &&
      (item.inStock === false || item.in_stock === "0" || availability === "out_of_stock" || availability === "not_available")) {
    const key = product.id;
    const stores = outOfStock.get(key) || new Set();
    stores.add(store.trim());
    outOfStock.set(key, stores);
    continue;
  }
  const currency = String(item.currency || item.price || "").toUpperCase();
  const valid = product && typeof store === "string" && store.trim() &&
    Number.isFinite(price) && price > 0 &&
    typeof url === "string" && /^https:\/\//i.test(url) &&
    ["new", "novo"].includes(condition) && inStock &&
    !currency.includes("USD") && !currency.includes("EUR") &&
    (!item.price || !String(item.price).match(/[A-Z]{3}/) || currency.includes("BRL") || item.currency === "BRL");
  if (!valid) {
    rejected.push(item.productId || item.mpn || item.gtin || item.id || "oferta sem identificador");
    continue;
  }
  const offer = {
    store: store.trim(), price, currency: "BRL", url,
    checkedAt: today, checkedAtTime: now.toISOString(),
    condition: "new", inStock: true
  };
  if (item.paymentNote) offer.paymentNote = String(item.paymentNote).slice(0, 300);
  const list = accepted.get(product.id) || [];
  list.push(offer);
  accepted.set(product.id, list);
}
if (!accepted.size && !outOfStock.size) throw new Error(`Nenhuma oferta passou na validação. ${rejected.length} registros rejeitados; catálogo preservado.`);

for (const [productId, stores] of outOfStock) {
  const product = known.get(productId);
  product.offers = (product.offers || []).filter(offer => !stores.has(offer.store));
}
for (const [productId, offers] of accepted) {
  const product = known.get(productId);
  const unique = new Map();
  for (const offer of offers) {
    const key = `${offer.store}|${offer.url}`;
    if (!unique.has(key) || offer.price < unique.get(key).price) unique.set(key, offer);
  }
  product.offers = [...unique.values()].sort((a, b) => a.price - b.price);
  product.researchStatus = "validated_offer";
}
catalog.lastPriceSyncAt = now.toISOString();
catalog.priceSync = {
  status: "success",
  source: process.env.PCMASTER_AWIN_FEED_URL ? "awin_authorized_feed" : "authorized_partner_feed",
  updatedProducts: new Set([...accepted.keys(), ...outOfStock.keys()]).size,
  acceptedOffers: [...accepted.values()].reduce((n, list) => n + list.length, 0),
  removedOutOfStockOffers: [...outOfStock.values()].reduce((n, stores) => n + stores.size, 0),
  rejectedOffers: rejected.length
};
await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Catálogo atualizado: ${new Set([...accepted.keys(), ...outOfStock.keys()]).size} produtos. Ofertas rejeitadas: ${rejected.length}.`);
