import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { callChatProvider, callGatewayChat } from "@/lib/ai/providers.server";
import { ensureAccount, chargeCredits, grantCredits } from "@/lib/credits.server";
import { CREDITS_PER_STEP } from "@/lib/credits";
import { fetchPrinterStatus, sendPrinterCommand, uploadGcodeFile } from "@/lib/printer.server";

const SYSTEM_PROMPT = `You are PrintPilot AI, the built-in engineer inside the PrintPilot 3D printing slicer.

You work on the user's ACTUAL open project. Every model, setting, printer and slice result you are given is real data read from the application. Never invent numbers: if you need a measurement, call a tool. If a tool cannot answer something, say so plainly.

Rules:
- Call tools to inspect geometry or settings before recommending changes. Do not guess dimensions, overhang percentages, print time or filament use.
- When a change would modify the project (moving, scaling, repairing, cutting, changing settings), explain briefly what you are about to do, then call the tool. The application asks the user to approve destructive changes.
- Prefer the smallest set of changes that solves the problem.
- Never promise an exact strength or time saving; describe estimates as estimates and say what they are based on.
- Answer in the user's language, concisely, using millimetres, grams, degrees Celsius and minutes.
- You cannot invent new printer features. If a printer lacks something (for example an enclosure), say the printer does not support it.`;

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      configId: z.string().min(1),
      messages: z.array(z.any()).max(80),
      tools: z.array(z.any()).max(60).optional(),
      system: z.string().max(20000).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const config = await base44.asServiceRole.entities.AIConfig.get(data.configId);
    if (!config || config.created_by_id !== context.user.id) {
      throw Object.assign(new Error("AI configuration not found"), { status: 404 });
    }
    const result = await callChatProvider({
      provider: config.provider,
      model: config.model,
      apiKey: config.api_key,
      baseUrl: config.base_url,
      messages: data.messages,
      tools: data.tools,
      system: data.system ? `${SYSTEM_PROMPT}\n\n${data.system}` : SYSTEM_PROMPT,
    });
    return result;
  });

export const testAiConfig = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ configId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const config = await base44.asServiceRole.entities.AIConfig.get(data.configId);
    if (!config || config.created_by_id !== context.user.id) {
      throw Object.assign(new Error("AI configuration not found"), { status: 404 });
    }
    const result = await callChatProvider({
      provider: config.provider,
      model: config.model,
      apiKey: config.api_key,
      baseUrl: config.base_url,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      tools: [],
      system: "You are a connection test. Reply with one word.",
    });
    return { ok: true, reply: (result.content || "").slice(0, 200) };
  });

export const printerStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      kind: z.enum(["octoprint", "moonraker"]),
      baseUrl: z.string().min(4).max(300),
      apiKey: z.string().max(300).optional(),
    })
  )
  .handler(async ({ data }) => {
    return fetchPrinterStatus(data);
  });

export const printerCommand = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      kind: z.enum(["octoprint", "moonraker"]),
      baseUrl: z.string().min(4).max(300),
      apiKey: z.string().max(300).optional(),
      action: z.enum(["pause", "resume", "cancel"]),
    })
  )
  .handler(async ({ data }) => {
    return sendPrinterCommand(data);
  });

export const uploadGcode = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      kind: z.enum(["octoprint", "moonraker"]),
      baseUrl: z.string().min(4).max(300),
      apiKey: z.string().max(300).optional(),
      filename: z.string().min(1).max(120),
      gcode: z.string().min(1).max(20000000),
    })
  )
  .handler(async ({ data }) => {
    return uploadGcodeFile(data);
  });

export const getCreditAccount = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    return ensureAccount(context.getBase44().asServiceRole, context.user);
  });

export const aiChatWithCredits = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      messages: z.array(z.any()).max(80),
      tools: z.array(z.any()).max(60).optional(),
      system: z.string().max(20000).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const serviceRole = base44.asServiceRole;
    const account = await ensureAccount(serviceRole, context.user);
    if ((account.balance || 0) < CREDITS_PER_STEP) {
      throw Object.assign(
        new Error("You are out of AI credits. Add more on the AI Credits page."),
        { status: 402 }
      );
    }
    const result = await callGatewayChat({
      base44,
      model: "automatic",
      messages: data.messages,
      tools: data.tools,
      system: data.system ? `${SYSTEM_PROMPT}\n\n${data.system}` : SYSTEM_PROMPT,
    });
    const balance = await chargeCredits(serviceRole, account, CREDITS_PER_STEP, "AI assistant step");
    return { ...result, creditsLeft: balance };
  });

function firstRecord(res) {
  return (Array.isArray(res) ? res : res?.items || [])[0] || null;
}

async function readPaymentSettings(serviceRole) {
  return firstRecord(await serviceRole.entities.PaymentSettings.list("-created_date", 1));
}

function requireAdmin(user) {
  if (user?.role !== "admin") {
    throw Object.assign(new Error("Only the app owner can do this"), { status: 403 });
  }
}

export const getPaymentSettings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    return readPaymentSettings(context.getBase44().asServiceRole);
  });

export const savePaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      cashapp_link: z.string().trim().min(4).max(300),
      price_per_credit: z.number().min(0.001).max(100),
      min_credits: z.number().int().min(1).max(100000),
    })
  )
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const serviceRole = context.getBase44().asServiceRole;
    const existing = await readPaymentSettings(serviceRole);
    if (existing) return serviceRole.entities.PaymentSettings.update(existing.id, data);
    return serviceRole.entities.PaymentSettings.create(data);
  });

export const requestCredits = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      credits: z.number().int().min(1).max(100000),
      reference: z.string().trim().min(2).max(200),
    })
  )
  .handler(async ({ data, context }) => {
    const serviceRole = context.getBase44().asServiceRole;
    const settings = await readPaymentSettings(serviceRole);
    const rate = Number(settings?.price_per_credit) || 0;
    if (!settings?.cashapp_link || rate <= 0) {
      throw Object.assign(new Error("Credit purchases are not open yet."), { status: 400 });
    }
    if (data.credits < (Number(settings.min_credits) || 1)) {
      throw Object.assign(
        new Error(`The smallest purchase is ${settings.min_credits} credits.`),
        { status: 400 }
      );
    }
    const amount = Math.round(data.credits * rate * 100) / 100;
    return serviceRole.entities.CreditRequest.create({
      user_id: context.user.id,
      email: context.user.email || "",
      credits: data.credits,
      amount_usd: amount,
      reference: data.reference,
      status: "pending",
    });
  });

export const approveCreditRequest = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const serviceRole = context.getBase44().asServiceRole;
    const request = await serviceRole.entities.CreditRequest.get(data.id);
    if (!request) throw Object.assign(new Error("Request not found"), { status: 404 });
    if (request.status === "approved") return { status: "approved" };
    const account = await ensureAccount(serviceRole, {
      id: request.user_id,
      email: request.email,
    });
    const balance = await grantCredits(
      serviceRole,
      account,
      request.credits,
      request.amount_usd,
      `Cash App purchase · ${request.reference}`
    );
    await serviceRole.entities.CreditRequest.update(request.id, {
      status: "approved",
      reviewed_by: context.user.email || context.user.id,
    });
    return { status: "approved", balance };
  });

export const rejectCreditRequest = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string().min(1), note: z.string().max(300).optional() }))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const serviceRole = context.getBase44().asServiceRole;
    const request = await serviceRole.entities.CreditRequest.get(data.id);
    if (!request) throw Object.assign(new Error("Request not found"), { status: 404 });
    return serviceRole.entities.CreditRequest.update(request.id, {
      status: "rejected",
      admin_note: data.note || "",
      reviewed_by: context.user.email || context.user.id,
    });
  });