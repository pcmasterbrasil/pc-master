/* PC MASTER — combinações de peças e ofertas verificadas.
   Não recomenda preços vencidos, itens usados ou combinações incompatíveis. */
const PCMaster = (() => {
  const REQUIRED = ["cpu", "motherboard", "ram", "storage", "psu", "case"];
  const MAX_BUILDS = 60;
  const MAX_OFFER_AGE_DAYS = 7;

  const daysOld = date => {
    const t = Date.parse(date);
    return Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
  };

  const offersFor = product => (product.offers || [])
    .filter(o =>
      Number.isFinite(Number(o.price)) && Number(o.price) > 0 &&
      typeof o.url === "string" && /^https:\/\//i.test(o.url) &&
      o.checkedAt && daysOld(o.checkedAt) >= -0.05 &&
      daysOld(o.checkedAt) <= MAX_OFFER_AGE_DAYS &&
      o.inStock === true && o.condition === "new" &&
      (!o.currency || o.currency === "BRL")
    )
    .sort((a, b) => Number(a.price) - Number(b.price));

  const offerOptions = product => offersFor(product).map(offer => ({ product, offer }));
  const powerConnectors = psu => psu.specs?.pcieConnectors || psu.specs?.gpuConnectors || [];
  const compatible = selected => {
    const get = category => selected[category]?.product;
    const cpu = get("cpu"), board = get("motherboard"), ram = get("ram");
    const storage = get("storage"), psu = get("psu"), box = get("case");
    const gpu = get("gpu"), cooler = get("cooler");
    if (!cpu || !board || !ram || !storage || !psu || !box) return false;

    const cs = cpu.specs || {}, bs = board.specs || {}, rs = ram.specs || {};
    const ss = storage.specs || {}, ps = psu.specs || {}, ks = box.specs || {};
    if (!cs.socket || cs.socket !== bs.socket) return false;
    if (!cs.memoryType || cs.memoryType !== bs.memoryType || rs.memoryType !== bs.memoryType) return false;
    if (bs.maxMemoryGb && rs.capacityGb > bs.maxMemoryGb) return false;
    if (bs.memorySlots && rs.modules && rs.modules > bs.memorySlots) return false;
    if (bs.maxMemorySpeedMhz && rs.speedMhz && rs.speedMhz > bs.maxMemorySpeedMhz) return false;
    if (bs.formFactor && ks.formFactors && !ks.formFactors.includes(bs.formFactor)) return false;
    if (ss.interface && bs.storageInterfaces && !bs.storageInterfaces.includes(ss.interface)) return false;
    if (ss.formFactor === "M.2 2280" && bs.m2Slots === 0) return false;
    if (gpu && ks.maxGpuLengthMm && gpu.specs?.lengthMm && gpu.specs.lengthMm > ks.maxGpuLengthMm) return false;
    if (gpu && gpu.specs?.powerConnectors?.length) {
      const available = powerConnectors(ps);
      if (!available.length || gpu.specs.powerConnectors.some(c => !available.includes(c))) return false;
    }
    if (cooler) {
      if (cooler.specs?.sockets && !cooler.specs.sockets.includes(cs.socket)) return false;
      if (ks.maxCpuCoolerHeightMm && cooler.specs?.heightMm && cooler.specs.heightMm > ks.maxCpuCoolerHeightMm) return false;
    } else if (cs.coolerIncluded === false) return false;

    const watts = Number(cs.tdpW || 0) + Number(gpu?.specs?.tdpW || 0) +
      Number(bs.estimatedW || 50) + Number(rs.estimatedW || 10) +
      Number(ss.estimatedW || 10) + 80;
    const recommended = watts * 1.35;
    if (Number(ps.wattageW || 0) < recommended) return false;
    if (ps.continuousW && ps.continuousW < recommended) return false;
    return true;
  };

  function generate(catalog, budget, purpose, priority) {
    if (!catalog || !Array.isArray(catalog.products) || !Number.isFinite(Number(budget))) return [];
    const products = catalog.products.filter(p => p?.id && p?.model && p?.category && p?.specs);
    const groups = {};
    for (const p of products) {
      const options = offerOptions(p);
      if (options.length) (groups[p.category] ||= []).push(...options);
    }

    const needsDiscreteGpu = purpose === "games" || purpose === "editing";
    if (REQUIRED.some(category => !(groups[category] || []).length)) return [];
    if (needsDiscreteGpu && !(groups.gpu || []).length) return [];

    const categories = [...REQUIRED];
    if (needsDiscreteGpu || (groups.gpu || []).length) categories.push("gpu");
    if ((groups.cooler || []).length) categories.push("cooler");

    const order = categories.slice().sort((a, b) =>
      (groups[a] || []).length - (groups[b] || []).length);
    const chosen = {};
    const results = [];
    const partialCost = () => Object.values(chosen).reduce((sum, item) => sum + Number(item.offer.price), 0);

    const walk = index => {
      if (results.length >= MAX_BUILDS) return;
      if (index === order.length) {
        if (!compatible(chosen)) return;
        const parts = Object.entries(chosen).map(([category, item]) => ({
          ...item.product,
          selectedOffer: item.offer,
          offers: [item.offer],
          category
        }));
        const total = partialCost();
        if (total > budget) return;
        const score = priority === "performance" ? total :
          priority === "economy" ? -total : -Math.abs(budget - total);
        results.push({ parts, total, score });
        return;
      }
      const category = order[index];
      if (category === "gpu" && purpose === "work" &&
          chosen.cpu?.product.specs?.integratedGraphics === true) {
        walk(index + 1);
        if (results.length >= MAX_BUILDS) return;
      }
      if (category === "cooler" && chosen.cpu?.product.specs?.coolerIncluded !== false) {
        walk(index + 1);
        if (results.length >= MAX_BUILDS) return;
      }
      for (const option of groups[category] || []) {
        chosen[category] = option;
        if (partialCost() <= budget) walk(index + 1);
        delete chosen[category];
        if (results.length >= MAX_BUILDS) break;
      }
    };

    walk(0);
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  return { generate, offersFor, MAX_BUILDS, MAX_OFFER_AGE_DAYS };
})();

if (typeof window !== "undefined") window.PCMaster = PCMaster;
if (typeof module !== "undefined" && module.exports) module.exports = PCMaster;
