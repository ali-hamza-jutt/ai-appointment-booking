"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import {
  getListAllowedOriginsQueryKey,
  useAddAllowedOrigin,
  useListAllowedOrigins,
  useRemoveAllowedOrigin,
} from "@/generated/api/businesses/businesses";
import type { BusinessResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

const subscribe = () => () => undefined;

/** The public booking page, the widget snippet and the websites allowed to show the widget. */
export function WidgetPanel({ business, canEdit }: { business: BusinessResponse; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const [site, setSite] = useState("");
  const [copied, setCopied] = useState(false);
  const originsQuery = useListAllowedOrigins(business.id);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAllowedOriginsQueryKey(business.id) });
  const addMutation = useAddAllowedOrigin({ mutation: { onSuccess: () => { setSite(""); return refresh(); } } });
  const removeMutation = useRemoveAllowedOrigin({ mutation: { onSuccess: refresh } });
  const pageLink = `${origin}/b/${business.slug}`;
  const snippet = `<script src="${origin}/widget.js" data-business="${business.slug}" async></script>`;
  const origins = originsQuery.data?.items ?? [];

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function addSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (site.trim()) addMutation.mutate({ businessId: business.id, data: { origin: site.trim() } });
  }

  return (
    <SectionCard
      description="Customers can book on your BookWise page, or from a button on your own website."
      title="Booking page and widget"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{pageLink}</p>
          <LinkButton href={`/b/${business.slug}`} rel="noopener" size="sm" target="_blank" variant="secondary">
            Open page
          </LinkButton>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Widget for your website</p>
          <p className="mt-1 text-sm text-muted">
            Paste this before the closing &lt;/body&gt; tag. It adds a Book now button that opens booking in a window.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink">{snippet}</pre>
          <Button className="mt-2" onClick={() => void copySnippet()} size="sm" variant="secondary">
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Websites allowed to show the widget</p>
          <p className="mt-1 text-sm text-muted">The widget only opens on these sites, so nobody else can put your booking inside theirs.</p>
          {originsQuery.isPending ? (
            <Skeleton className="mt-2 h-12 rounded-lg" />
          ) : origins.length === 0 ? (
            <p className="mt-2 text-sm text-subtle">None yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {origins.map((item) => (
                <li className="flex items-center justify-between gap-3 px-4 py-2" key={item.id}>
                  <span className="truncate text-sm text-ink">{item.origin}</span>
                  {canEdit ? (
                    <Button
                      isLoading={removeMutation.isPending && removeMutation.variables?.originId === item.id}
                      onClick={() => removeMutation.mutate({ businessId: business.id, originId: item.id })}
                      size="sm"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={addSite}>
              <div className="min-w-56 flex-1">
                <TextField
                  hideLabel
                  id="widget-site"
                  label="Website"
                  onChange={(event) => setSite(event.target.value)}
                  placeholder="https://www.yoursalon.com"
                  value={site}
                />
              </div>
              <Button disabled={!site.trim()} isLoading={addMutation.isPending} type="submit" variant="secondary">
                Allow website
              </Button>
            </form>
          ) : null}
          {addMutation.error || removeMutation.error ? (
            <Alert className="mt-3" tone="danger">
              {getApiErrorMessage(addMutation.error ?? removeMutation.error, "Enter a website address such as https://example.com.")}
            </Alert>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
