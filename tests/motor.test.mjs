import assert from "node:assert/strict";
import PCMaster from "../motor.js";

const today = new Date().toISOString().slice(0, 10);
const offer = (price, extra = {}) => ({
  store: "Loja Teste", price, currency: "BRL",
  url: "https://loja.example/produto", checkedAt: today,
  condition: "new", inStock: true, ...extra
});
const product = (id, category, specs, price) => ({
  id, brand: "Teste", model: id, category, specs, offers: [offer(price)]
});
const base = [
  product("cpu", "cpu", { socket: "AM4", memoryType: "DDR4", tdpW: 65, coolerIncluded: true, integratedGraphics: false }, 500),
  product("board", "motherboard", { socket: "AM4", memoryType: "DDR4", formFactor: "mATX", estimatedW: 50, storageInterfaces: ["NVMe PCIe 3.0 x4"] }, 400),
  product("ram", "ram", { memoryType: "DDR4", capacityGb: 16, speedMhz: 3200, estimatedW: 10 }, 250),
  product("ssd", "storage", { interface: "NVMe PCIe 3.0 x4", formFactor: "M.2 2280", estimatedW: 5 }, 200),
  product("psu", "psu", { wattageW: 650, pcieConnectors: ["2x PCIe 6+2-pin"] }, 350),
  product("case", "case", { formFactors: ["mATX"], maxGpuLengthMm: 300 }, 250),
  product("gpu", "gpu", { tdpW: 115, lengthMm: 220, powerConnectors: ["1x PCIe 8-pin"] }, 1500)
];
const games = PCMaster.generate({ products: base }, 4000, "games", "balance");
assert.equal(games.length, 1, "deve montar um PC gamer compatível");
assert.equal(games[0].parts.find(p => p.category === "gpu").selectedOffer.price, 1500);
assert.ok(games[0].total <= 4000);

const performanceCatalog = structuredClone(base);
performanceCatalog.find(p => p.category === "gpu").specs.performanceScore = 70;
const fasterGpu = product("gpu-faster", "gpu", {
  tdpW: 130, lengthMm: 230, powerConnectors: ["1x PCIe 8-pin"], performanceScore: 95
}, 1700);
performanceCatalog.push(fasterGpu);
const performanceBuilds = PCMaster.generate({ products: performanceCatalog }, 5000, "games", "performance");
assert.equal(performanceBuilds[0].parts.find(p => p.category === "gpu").id, "gpu-faster",
  "prioridade desempenho deve respeitar pontuação técnica cadastrada");

const noGpuConnector = structuredClone(base);
noGpuConnector.find(p => p.category === "psu").specs.pcieConnectors = [];
assert.equal(PCMaster.generate({ products: noGpuConnector }, 4000, "games", "balance").length, 0,
  "deve rejeitar fonte sem conector exigido pela GPU");

const tooLongGpu = structuredClone(base);
tooLongGpu.find(p => p.category === "case").specs.maxGpuLengthMm = 200;
assert.equal(PCMaster.generate({ products: tooLongGpu }, 4000, "games", "balance").length, 0,
  "deve rejeitar GPU maior que o espaço do gabinete");

const wrongMemory = structuredClone(base);
wrongMemory.find(p => p.category === "ram").specs.memoryType = "DDR5";
assert.equal(PCMaster.generate({ products: wrongMemory }, 4000, "games", "balance").length, 0,
  "deve rejeitar memória incompatível com a placa-mãe");

const stale = structuredClone(base);
stale[0].offers[0].checkedAt = "2020-01-01";
assert.equal(PCMaster.generate({ products: stale }, 4000, "games", "balance").length, 0,
  "não deve recomendar oferta vencida");

const office = structuredClone(base).filter(p => p.category !== "gpu");
office[0].specs.integratedGraphics = true;
assert.equal(PCMaster.generate({ products: office }, 2500, "work", "economy").length, 1,
  "trabalho pode usar vídeo integrado sem placa dedicada");

const officeWithoutIntegratedGraphics = structuredClone(base).filter(p => p.category !== "gpu");
officeWithoutIntegratedGraphics[0].specs.integratedGraphics = false;
assert.equal(PCMaster.generate({ products: officeWithoutIntegratedGraphics }, 2500, "work", "economy").length, 0,
  "não deve montar PC sem GPU quando o processador não tem vídeo integrado");


const wrongBoardCpuSupport = structuredClone(base);
wrongBoardCpuSupport.find(p => p.category === "motherboard").specs.supportedCpuIds = ["outro-processador"];
assert.equal(PCMaster.generate({ products: wrongBoardCpuSupport }, 4000, "games", "balance").length, 0,
  "deve rejeitar CPU fora da lista explícita de suporte da placa-mãe");

const unknownCaseFormFactor = structuredClone(base);
delete unknownCaseFormFactor.find(p => p.category === "case").specs.formFactors;
assert.equal(PCMaster.generate({ products: unknownCaseFormFactor }, 4000, "games", "balance").length, 0,
  "deve rejeitar gabinete sem dados suficientes de formato compatível");

const unsupportedStorage = structuredClone(base);
unsupportedStorage.find(p => p.category === "motherboard").specs.storageInterfaces = [];
assert.equal(PCMaster.generate({ products: unsupportedStorage }, 4000, "games", "balance").length, 0,
  "deve rejeitar armazenamento sem interface confirmada na placa-mãe");

const unknownCpuCooler = structuredClone(base);
delete unknownCpuCooler[0].specs.coolerIncluded;
assert.equal(PCMaster.generate({ products: unknownCpuCooler }, 4000, "games", "balance").length, 0,
  "deve exigir confirmação de cooler incluso ou cooler adicional");

console.log("Testes PC MASTER: todos passaram.");
