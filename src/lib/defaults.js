export const DEFAULT_SETTINGS = {
  layerHeight: 0.2,
  firstLayerHeight: 0.25,
  wallCount: 3,
  topLayers: 4,
  bottomLayers: 3,
  lineWidth: 0.45,
  infillDensity: 20,
  infillPattern: "grid",
  printSpeed: 120,
  outerWallSpeed: 60,
  infillSpeed: 150,
  travelSpeed: 200,
  firstLayerSpeed: 25,
  supportSpeed: 60,
  nozzleTemp: 215,
  firstLayerNozzleTemp: 215,
  bedTemp: 60,
  firstLayerBedTemp: 65,
  retractionLength: 0.8,
  retractionSpeed: 35,
  zHop: 0.2,
  fanSpeed: 100,
  supports: false,
  supportAngle: 45,
  supportDensity: 12,
  adhesion: "skirt",
  skirtLoops: 2,
  skirtDistance: 3,
  brimWidth: 5,
  seam: "aligned",
  ironing: false,
};

export const DEFAULT_PRINTER = {
  name: "Creality Ender-3 V3",
  manufacturer: "Creality",
  build_x: 220,
  build_y: 220,
  build_z: 250,
  nozzle_diameter: 0.4,
  filament_diameter: 1.75,
  max_nozzle_temp: 300,
  max_bed_temp: 110,
  max_speed: 250,
  max_acceleration: 2500,
  firmware: "Marlin",
  start_gcode: "",
  end_gcode: "",
};

export const DEFAULT_FILAMENT = {
  name: "Generic PLA",
  material: "PLA",
  diameter: 1.75,
  density: 1.24,
  nozzle_temp: 210,
  first_layer_nozzle_temp: 215,
  bed_temp: 60,
  first_layer_bed_temp: 65,
  max_volumetric_speed: 12,
  flow_ratio: 1,
  retraction_length: 0.8,
  retraction_speed: 35,
  fan_speed: 100,
};

export function tempsFromFilament(filament) {
  return {
    nozzleTemp: filament.nozzle_temp,
    firstLayerNozzleTemp: filament.first_layer_nozzle_temp,
    bedTemp: filament.bed_temp,
    firstLayerBedTemp: filament.first_layer_bed_temp,
    retractionLength: filament.retraction_length,
    retractionSpeed: filament.retraction_speed,
    fanSpeed: filament.fan_speed,
  };
}

export const AI_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyHint: "sk-...",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyHint: "sk-ant-...",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-sonnet-4-20250514"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyHint: "AIza...",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  {
    id: "openai_compatible",
    label: "OpenAI-compatible API",
    baseUrl: "https://your-endpoint/v1",
    keyHint: "API key",
    models: [],
  },
  {
    id: "local",
    label: "Local server (Ollama / LM Studio)",
    baseUrl: "http://localhost:11434/v1",
    keyHint: "usually not required",
    models: ["llama3.1", "qwen2.5", "mistral-nemo"],
  },
];

export const INFILL_PATTERNS = ["grid", "lines", "concentric"];
export const SEAM_MODES = ["aligned", "random", "front"];
export const ADHESION_MODES = ["none", "skirt", "brim"];