import type { CatalogItem } from "./types";

/** Approved buy-list. The agent may select from this list. It cannot set a price. */
export const CATALOG: CatalogItem[] = [
  {
    sku: "desk",
    name: "Standing desk",
    aliases: ["standing desk", "desk"],
    unitPriceCents: 42000,
    unit: "each",
    blurb: "Electric sit-stand, 48 inch",
  },
  {
    sku: "arm",
    name: "Monitor arm",
    aliases: ["monitor arm", "arm"],
    unitPriceCents: 8900,
    unit: "each",
    blurb: "Single-screen clamp mount",
  },
  {
    sku: "keyboard",
    name: "Mechanical keyboard",
    aliases: ["mechanical keyboard", "keyboard"],
    unitPriceCents: 12900,
    unit: "each",
    blurb: "Hot-swap, low profile",
  },
  {
    sku: "headset",
    name: "Noise-cancelling headset",
    aliases: ["noise-cancelling headset", "headset", "headphones"],
    unitPriceCents: 19900,
    unit: "each",
    blurb: "USB-C, with a boom mic",
  },
  {
    sku: "hub",
    name: "USB-C hub",
    aliases: ["usb-c hub", "usb c hub", "hub"],
    unitPriceCents: 4900,
    unit: "each",
    blurb: "Seven ports, HDMI",
  },
  {
    sku: "chair",
    name: "Ergonomic chair",
    aliases: ["ergonomic chair", "chair"],
    unitPriceCents: 54900,
    unit: "each",
    blurb: "Adjustable lumbar",
  },
  {
    sku: "coffee",
    name: "Coffee beans, 1kg",
    aliases: ["coffee beans", "coffee", "beans"],
    unitPriceCents: 2400,
    unit: "bag",
    blurb: "Medium roast",
  },
  {
    sku: "notebook",
    name: "Workshop notebook set",
    aliases: ["notebook set", "notebook", "notepad"],
    unitPriceCents: 1800,
    unit: "set",
    blurb: "Pack of six",
  },
];

export function findCatalogItem(sku: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.sku === sku);
}
