/* PC MASTER — motor de compatibilidade e combinações
   O motor só usa produtos/ofertas completos e validados no catálogo. */
const PCMaster = (() => {
  const REQUIRED = ["cpu","motherboard","ram","storage","psu","case"];
  const MAX_BUILDS = 60;
  const MAX_OFFER_AGE_DAYS = 7;

  const daysOld = (date) => {
    const t = Date.parse(date);
    return Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
  };
  const offersFor = (product) => (product.offers || [])
    .filter(o => Number.isFinite(Number(o.price)) && Number(o.price) > 0 &&
      o.url && /^https:\/\//i.test(o.url) && o.checkedAt &&
      daysOld(o.checkedAt) <= MAX_OFFER_AGE_DAYS && o.inStock === true &&
      o.condition === "new")
    .sort((a,b) => Number(a.price)-Number(b.price));
  const usable = (products) => products.filter(p =>
    p.model && p.category && p.specs && offersFor(p).length
  );
  const totalPrice = (parts) => parts.reduce((s,p) => s + Number(offersFor(p)[0].price),0);
  const compatible = (parts) => {
    const get = c => parts.find(p => p.category === c);
    const cpu=get("cpu"), board=get("motherboard"), ram=get("ram");
    const gpu=get("gpu"), psu=get("psu"), box=get("case"), cooler=get("cooler");
    if (!cpu || !board || !ram || !get("storage") || !psu || !box) return false;
    if (cpu.specs.socket !== board.specs.socket) return false;
    if (ram.specs.memoryType !== board.specs.memoryType) return false;
    if (board.specs.maxMemoryGb && ram.specs.capacityGb > board.specs.maxMemoryGb) return false;
    if (board.specs.formFactor && box.specs.formFactors &&
        !box.specs.formFactors.includes(board.specs.formFactor)) return false;
    if (gpu && box.specs.maxGpuLengthMm && gpu.specs.lengthMm &&
        gpu.specs.lengthMm > box.specs.maxGpuLengthMm) return false;
    const watts = Number(cpu.specs.tdpW||0) + Number(gpu?.specs.tdpW||0) +
      Number(board.specs.estimatedW||50) + Number(ram.specs.estimatedW||10) +
      Number(get("storage").specs.estimatedW||10) + 80;
    if (Number(psu.specs.wattageW||0) < watts * 1.25) return false;
    if (cooler && cooler.specs.sockets &&
        !cooler.specs.sockets.includes(cpu.specs.socket)) return false;
    if (cpu.specs.coolerIncluded === false && !cooler) return false;
    return true;
  };
  function generate(catalog, budget, purpose, priority) {
    const products=usable((catalog.products||[]).map(p=>({...p,offers:[...(p.offers||[]),...(catalog.offers||[]).filter(o=>o.productId===p.id)]})));
    const groups={};
    for (const p of products) (groups[p.category] ||= []).push(p);
    const needsGpu = purpose === "games" || purpose === "editing";
    const categories=[...REQUIRED];
    if (needsGpu) categories.push("gpu");
    if ((groups.gpu||[]).length && !needsGpu) categories.push("gpu");
    if ((groups.cooler||[]).length) categories.push("cooler");
    if (categories.some(c => !(groups[c]||[]).length)) return [];
    const order=priority==="economy" ? categories : categories.slice().sort((a,b)=>(groups[a]||[]).length-(groups[b]||[]).length);
    const results=[];
    const walk=(index,chosen)=>{
      if(results.length>=MAX_BUILDS) return;
      if(index===order.length){
        const parts=Object.values(chosen);
        if(!compatible(parts)) return;
        const total=totalPrice(parts);
        if(total>budget) return;
        results.push({parts,total,score: priority==="performance" ? total : priority==="economy" ? -total : -Math.abs(budget-total)});
        return;
      }
      const cat=order[index];
      for(const p of groups[cat]){
        chosen[cat]=p;
        if(totalPrice(Object.values(chosen))<=budget) walk(index+1,chosen);
        delete chosen[cat];
        if(results.length>=MAX_BUILDS) break;
      }
    };
    walk(0,{});
    results.sort((a,b)=>priority==="performance" ? b.score-a.score : priority==="economy" ? b.score-a.score : b.score-a.score);
    return results;
  }
  return {generate,offersFor,MAX_BUILDS};
})();