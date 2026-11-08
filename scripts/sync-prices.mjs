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
if (feedOffers.at(-1)?.error) {
  throw new Error(`Feed Awin incompleto: ${feedOffers.at(-1).message || "erro na última linha"}. Catálogo preservado.`);
}

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
const flattenFeedRecord = value => {
  const flat = {};
  const visit = object => {
    if (!object || typeof object !== "object" || Array.isArray(object)) return;
    for (const [key, child] of Object.entries(object)) {
      if (child && typeof child === "object" && !Array.isArray(child)) visit(child);
      else if (child !== undefined && child !== null) flat[key] = child;
    }
  };
  visit(value);
  return flat;
};

const parsePrice = value => {
  if (typeof value === "number") return value;
  let text = String(value || "").trim().replace(/[^0-9,.-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  const price = Number(text);
  return Number.isFinite(price) ? price : NaN;
};

for (const original of feedOffers) {
  // Awin Enhanced/Google JSONL pode organizar os campos em seções aninhadas
  // (por exemplo, product_basic e meta); feeds simples podem continuar planos.
  const flat = flattenFeedRecord(original);
  const isAwinFeed = Boolean(process.env.PCMASTER_AWIN_FEED_URL);
  const item = {
    ...flat,
    productId: flat.productId,
    mpn: flat.mpn,
    gtin: flat.gtin || flat.product_GTIN,
    store: flat.store || flat.merchant || flat.advertiser || flat.advertiser_name || process.env.PCMASTER_AWIN_STORE_NAME,
    price: flat.price,
    currency: flat.currency || (typeof flat.price === "string" ? flat.price.trim().split(/\\s+/).pop() : undefined),
    url: isAwinFeed ? (flat.aw_deep_link || flat.deep_link) : (flat.url || flat.link || flat.deep_link),
    condition: flat.condition,
    availability: flat.availability,
    inStock: flat.inStock
  };
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
  const inStock = item.inStock === true || item.in_stock === "1" || item.in_stock === 1 || item.in_stock === true || availability === "in_stock";
  if (product && typeof store === "string" && store.trim() &&
      (item.inStock === false || item.in_stock === false || item.in_stock === "0" || item.in_stock === 0 || availability === "out_of_stock" || availability === "not_available")) {
    const key = product.id;
    const stores = outOfStock.get(key) || new Set();
    stores.add(store.trim());
    outOfStock.set(key, stores);
    continue;
  }
  const currencyIsBrl = item.currency === "BRL" ||
    (typeof item.price === "string" && /\bBRL\b/i.test(item.price));
  const valid = product && typeof store === "string" && store.trim() &&
    Number.isFinite(price) && price > 0 &&
    typeof url === "string" && /^https:\/\//i.test(url) &&
    ["new", "novo"].includes(condition) && inStock && currencyIsBrl;
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
  const refreshedStores = new Set([...unique.values()].map(offer => offer.store));
  const retained = (product.offers || []).filter(offer => !refreshedStores.has(offer.store));
  product.offers = [...retained, ...unique.values()].sort((a, b) => a.price - b.price);
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
