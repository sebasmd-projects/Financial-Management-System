/**
 * Web Push desde el navegador (solo si el backend dice que tiene VAPID: `Prefs.push_available`). Es el ÚNICO módulo que toca
 * `navigator.serviceWorker` (lo vigila `guards.test.ts`). No guarda nada de la suscripción en el navegador: el endpoint y las
 * claves van al servidor (`POST /push-subscription`) y la carga de un push se muestra y se descarta (`sw-source.ts`).
 */
import type { Locale } from "@/i18n/config";
import { ASSET_PREFIX, rootPath } from "@/config/paths";

export type PushSupport = "supported" | "unsupported";
export type PushPermission = "granted" | "denied" | "default";

export function pushSupport(): PushSupport {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}

export function pushPermission(): PushPermission {
  return typeof Notification === "undefined" ? "default" : Notification.permission;
}

/** La clave pública VAPID (base64url) como los bytes que pide `PushManager.subscribe`. */
export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Lo que el servidor guarda de una suscripción: el endpoint y las dos claves del navegador. */
export interface PushPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function payloadOf(subscription: PushSubscription): PushPayload | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** El service worker se registra con el alcance de la app en ese idioma, no con el de todo el sitio. */
export function pushScope(locale: Locale): string {
  return `${rootPath(locale)}/`;
}

async function registration(locale: Locale): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(`${ASSET_PREFIX}/sw.js`, { scope: pushScope(locale) });
}

/** La suscripción de ESTE navegador en este idioma, o `null`. No pide permiso. */
export async function currentSubscription(locale: Locale): Promise<PushSubscription | null> {
  if (pushSupport() === "unsupported") return null;
  const existing = await navigator.serviceWorker.getRegistration(pushScope(locale));
  return existing ? existing.pushManager.getSubscription() : null;
}

export type SubscribeResult = { ok: true; payload: PushPayload } | { ok: false; reason: "unsupported" | "denied" | "dismissed" | "keys" };

/** Pide el permiso (la persona lo concede o no), registra el service worker y suscribe. */
export async function subscribeBrowser(locale: Locale, vapidPublicKey: string): Promise<SubscribeResult> {
  if (pushSupport() === "unsupported") return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
  const reg = await registration(locale);
  await navigator.serviceWorker.ready;
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(vapidPublicKey) }));
  const payload = payloadOf(subscription);
  return payload ? { ok: true, payload } : { ok: false, reason: "keys" };
}

/** Cancela la suscripción del navegador y devuelve su endpoint (para borrarla en el servidor), o `null` si no había. */
export async function unsubscribeBrowser(locale: Locale): Promise<string | null> {
  const subscription = await currentSubscription(locale);
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
