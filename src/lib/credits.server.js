/** Credit wallet operations. Server-side only; call with a service-role client. */

import { CREDITS_PER_STEP, FREE_CREDITS } from "@/lib/credits";

export async function ensureAccount(serviceRole, user) {
  const found = await serviceRole.entities.CreditAccount.filter({ user_id: user.id });
  const list = Array.isArray(found) ? found : found?.items || [];
  if (list.length) return list[0];

  const account = await serviceRole.entities.CreditAccount.create({
    user_id: user.id,
    email: user.email || "",
    balance: FREE_CREDITS,
    lifetime_purchased: 0,
    lifetime_spent: 0,
  });
  await serviceRole.entities.CreditTransaction.create({
    user_id: user.id,
    kind: "grant",
    credits: FREE_CREDITS,
    amount_usd: 0,
    description: "Welcome credits",
    balance_after: FREE_CREDITS,
  });
  return account;
}

export async function grantCredits(serviceRole, account, credits, amountUsd, description) {
  const added = credits || 0;
  const balance = (account.balance || 0) + added;
  await serviceRole.entities.CreditAccount.update(account.id, {
    balance,
    lifetime_purchased: (account.lifetime_purchased || 0) + added,
  });
  await serviceRole.entities.CreditTransaction.create({
    user_id: account.user_id,
    kind: "purchase",
    credits: added,
    amount_usd: amountUsd || 0,
    description: description || "Credit purchase",
    balance_after: balance,
  });
  return balance;
}

export async function chargeCredits(serviceRole, account, credits, description) {
  const spent = credits || CREDITS_PER_STEP;
  const balance = Math.max(0, (account.balance || 0) - spent);
  await serviceRole.entities.CreditAccount.update(account.id, {
    balance,
    lifetime_spent: (account.lifetime_spent || 0) + spent,
  });
  await serviceRole.entities.CreditTransaction.create({
    user_id: account.user_id,
    kind: "spend",
    credits: -spent,
    amount_usd: 0,
    description: description || "AI assistant step",
    balance_after: balance,
  });
  return balance;
}