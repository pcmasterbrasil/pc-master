/* PC MASTER — combinações de peças e ofertas verificadas.
   Não recomenda preços vencidos, itens usados ou combinações incompatíveis. */
const PCMaster = (() => {
  const REQUIRED = ["cpu", "motherboard", "ram", "storage", "psu", "case"];
  const MAX_BUILDS = 200;
  const MAX_CANDIDATE_BUILDS = 25000;
  const MAX_SEARCH_NODES = 250000;
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
    if (bs.supportedCpuIds && !bs.supportedCpuIds.includes(cpu.id)) return false;
    const cpuMemoryTypes = Array.isArray(cs.memoryTypes) ? cs.memoryTypes : [cs.memoryType].filter(Boolean);
    if (!cpuMemoryTypes.includes(bs.memoryType) || rs.memoryType !== bs.memoryType) return false;
    if (!Number.isFinite(Number(rs.capacityGb)) || Number(rs.capacityGb) <= 0) return false;
    if (bs.maxMemoryGb && rs.capacityGb > bs.maxMemoryGb) return false;
    if (bs.memorySlots && rs.modules && rs.modules > bs.memorySlots) return false;
    if (bs.maxMemorySpeedMhz && rs.speedMhz && rs.speedMhz > bs.maxMemorySpeedMhz) return false;
    if (!bs.formFactor || !Array.isArray(ks.formFactors) || !ks.formFactors.includes(bs.formFactor)) return false;
    if (!ss.interface || !Array.isArray(bs.storageInterfaces) || !bs.storageInterfaces.includes(ss.interface)) return false;
    if (ss.formFactor === "M.2 2280" && (!bs.m2Slots || bs.m2Slots <= 0)) return false;
    if (gpu && (!Number.isFinite(Number(ks.maxGpuLengthMm)) || !Number.isFinite(Number(gpu.specs?.lengthMm)) ||
        gpu.specs.lengthMm > ks.maxGpuLengthMm)) return false;
    if (gpu && gpu.specs?.powerConnectors?.length) {
      const countPcie8 = list => (list || []).reduce((sum, value) => {
        const text = String(value).toLowerCase();
        if (!/pcie|pci-e|6\+2|8.?pin/.test(text)) return sum;
        const match = text.match(/(\d+)\s*x/);
        return sum + (match ? Number(match[1]) : 1);
      }, 0);
      if (countPcie8(powerConnectors(psu)) < countPcie8(gpu.specs.powerConnectors)) return false;
    }
    if (cooler) {
      if (cooler.specs?.sockets && !cooler.specs.sockets.includes(cs.socket)) return false;
      if (ks.maxCpuCoolerHeightMm && cooler.specs?.heightMm && cooler.specs.heightMm > ks.maxCpuCoolerHeightMm) return false;
    } else if (cs.coolerIncluded !== true) return false;

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
    if (needsDiscreteGpu || purpose === "work" || (groups.gpu || []).length) categories.push("gpu");
    if ((groups.cooler || []).length) categories.push("cooler");

    // Mantém CPU antes de GPU/cooler, pois as decisões dessas peças dependem do processador escolhido.
    const order = categories;
    const chosen = {};
    const results = [];
    let visitedNodes = 0;
    const partialCost = () => Object.values(chosen).reduce((sum, item) => sum + Number(item.offer.price), 0);

    const walk = index => {
      if (results.length >= MAX_CANDIDATE_BUILDS || visitedNodes >= MAX_SEARCH_NODES) return;
      visitedNodes++;
      if (index === order.length) {
        // Um PC sem GPU dedicada só pode ser montado se o processador tiver vídeo integrado.
        if (!chosen.gpu && chosen.cpu?.product.specs?.integratedGraphics !== true) return;
        if (!compatible(chosen)) return;
        const parts = Object.entries(chosen).map(([category, item]) => ({
          ...item.product,
          selectedOffer: item.offer,
          offers: [item.offer],
          category
        }));
        const total = partialCost();
        if (total > budget) return;
        const performanceScore = parts.reduce((sum, part) =>
          sum + Number(part.specs?.performanceScore || 0), 0);
        const score = priority === "economy" ? -total :
          priority === "balance" ? -Math.abs(budget - total) : performanceScore;
        results.push({ parts, total, score, performanceScore });
        return;
      }
      const category = order[index];
      if (category === "gpu" && purpose === "work" &&
          chosen.cpu?.product.specs?.integratedGraphics === true) {
        walk(index + 1);
        if (results.length >= MAX_CANDIDATE_BUILDS || visitedNodes >= MAX_SEARCH_NODES) return;
      }
      if (category === "cooler" && chosen.cpu?.product.specs?.coolerIncluded !== false) {
        walk(index + 1);
        if (results.length >= MAX_CANDIDATE_BUILDS || visitedNodes >= MAX_SEARCH_NODES) return;
      }
      for (const option of groups[category] || []) {
        chosen[category] = option;
        if (partialCost() <= budget) walk(index + 1);
        delete chosen[category];
        if (results.length >= MAX_CANDIDATE_BUILDS || visitedNodes >= MAX_SEARCH_NODES) break;
      }
    };

    walk(0);
    results.sort((a, b) => priority === "performance"
      ? (b.performanceScore - a.performanceScore) || (b.total - a.total)
      : b.score - a.score);
    return results.slice(0, MAX_BUILDS);
  }

  return { generate, offersFor, MAX_BUILDS, MAX_OFFER_AGE_DAYS, MAX_SEARCH_NODES };
})();

if (typeof window !== "undefined") window.PCMaster = PCMaster;
if (typeof module !== "undefined" && module.exports) module.exports = PCMaster;
