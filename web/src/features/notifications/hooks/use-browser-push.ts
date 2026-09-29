"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  getGetPushSettingsQueryKey,
  useGetPushSettings,
  useRemovePushSubscription,
  useSavePushSubscription,
} from "@/generated/api/notifications/notifications";

const SERVICE_WORKER_URL = "/sw.js";

/** The VAPID key as the bytes PushManager wants. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);

  return bytes;
}

function browserSupportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);

  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Browser notifications for this browser: whether the server offers them,
 * whether this browser can show them, whether it's turned on, and switches.
 */
export function useBrowserPush() {
  const queryClient = useQueryClient();
  const settingsQuery = useGetPushSettings();
  const saveMutation = useSavePushSubscription();
  const removeMutation = useRemovePushSubscription();
  const [isOn, setIsOn] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = browserSupportsPush();

  useEffect(() => {
    if (!supported) return;

    void currentSubscription().then((subscription) => setIsOn(Boolean(subscription)));
  }, [supported]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getGetPushSettingsQueryKey() }),
    [queryClient],
  );

  async function turnOn() {
    const publicKey = settingsQuery.data?.publicKey;

    if (!publicKey) return;

    setIsWorking(true);
    setError(null);

    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setError("Notifications are blocked for this site. Allow them in your browser's site settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      const json = subscription.toJSON();

      await saveMutation.mutateAsync({
        data: { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } },
      });
      setIsOn(true);
      await refresh();
    } catch {
      setError("Browser notifications couldn't be turned on here. Please try again.");
    } finally {
      setIsWorking(false);
    }
  }

  async function turnOff() {
    setIsWorking(true);
    setError(null);

    try {
      const subscription = await currentSubscription();

      if (subscription) {
        await removeMutation.mutateAsync({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }

      setIsOn(false);
      await refresh();
    } catch {
      setError("Browser notifications couldn't be turned off. Please try again.");
    } finally {
      setIsWorking(false);
    }
  }

  return {
    /** The server has Web Push keys and this browser can show notifications. */
    available: supported && Boolean(settingsQuery.data?.enabled),
    isOn,
    isWorking,
    error,
    turnOn,
    turnOff,
  };
}
