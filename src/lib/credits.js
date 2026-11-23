/** AI credit wallet: shared constants for client and server. */

/** Credits charged for one AI model step (one assistant turn). */
export const CREDITS_PER_STEP = 1;

/** Credits granted to a new account so the assistant can be tried. */
export const FREE_CREDITS = 25;

export const CREDIT_PACKS = [
  { id: "starter", name: "Starter", credits: 100, priceUsd: 5 },
  { id: "maker", name: "Maker", credits: 500, priceUsd: 19 },
  { id: "studio", name: "Studio", credits: 2000, priceUsd: 59 },
];