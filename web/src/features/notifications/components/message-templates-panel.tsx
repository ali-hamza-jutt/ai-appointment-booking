"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextAreaField, TextField } from "@/components/ui/form-controls";
import { EditIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { SectionCard } from "@/components/ui/section-card";
import { NOTIFICATION_UI_CONSTANTS } from "@/features/notifications/constants/notification-ui.constants";
import type {
  NotificationTemplateResponse,
  NotificationTemplateVariable,
} from "@/generated/api/models";
import {
  getListTemplatesQueryKey,
  useListTemplates,
  useResetTemplate,
  useUpdateTemplate,
} from "@/generated/api/notifications/notifications";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

const { CHANNEL_LABELS, KIND_LABELS } = NOTIFICATION_UI_CONSTANTS;

/** The wording of every email and text, with a way to change or reset each one. */
export function MessageTemplatesPanel({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const templatesQuery = useListTemplates(businessId);
  const [editing, setEditing] = useState<NotificationTemplateResponse | null>(null);
  const templates = templatesQuery.data?.items ?? [];
  const kinds = [...new Set(templates.map((template) => template.kind))];

  return (
    <SectionCard
      description="Each message uses our wording until you write your own. Placeholders such as {{serviceName}} are filled in for each booking."
      title="Messages"
    >
      {templatesQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : templatesQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(templatesQuery.error, "Messages could not be loaded.")}</Alert>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {kinds.map((kind) => (
            <li className="px-4 py-3" key={kind}>
              <p className="text-sm font-semibold text-ink">{KIND_LABELS[kind]}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {templates
                  .filter((template) => template.kind === kind)
                  .map((template) => (
                    <Button
                      aria-label={`${canEdit ? "Edit" : "View"} ${KIND_LABELS[kind].toLowerCase()} ${CHANNEL_LABELS[template.channel].toLowerCase()}`}
                      key={template.channel}
                      leadingIcon={<EditIcon className="size-4" />}
                      onClick={() => setEditing(template)}
                      size="sm"
                      variant="secondary"
                    >
                      {CHANNEL_LABELS[template.channel]}
                      {template.isCustom ? (
                        <Badge className="ml-2" tone="brand">
                          Custom
                        </Badge>
                      ) : null}
                    </Button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && templatesQuery.data ? (
        <TemplateEditor
          businessId={businessId}
          canEdit={canEdit}
          key={`${editing.channel}-${editing.kind}`}
          onClose={() => setEditing(null)}
          template={editing}
          variables={templatesQuery.data.variables}
        />
      ) : null}
    </SectionCard>
  );
}

function TemplateEditor({
  businessId,
  canEdit,
  onClose,
  template,
  variables,
}: {
  businessId: string;
  canEdit: boolean;
  onClose: () => void;
  template: NotificationTemplateResponse;
  variables: NotificationTemplateVariable[];
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey(businessId) });
  const updateMutation = useUpdateTemplate({ mutation: { onSuccess: async () => { await refresh(); onClose(); } } });
  const resetMutation = useResetTemplate({ mutation: { onSuccess: async () => { await refresh(); onClose(); } } });
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const isEmail = template.channel === "EMAIL";
  const error = updateMutation.error ?? resetMutation.error;
  const target = { businessId, channel: template.channel, kind: template.kind };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate({ ...target, data: { body, ...(isEmail ? { subject } : {}) } });
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${KIND_LABELS[template.kind]} · ${CHANNEL_LABELS[template.channel]}`}
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">{getApiErrorMessage(error, "The message could not be saved.")}</Alert>
        ) : null}
        {isEmail ? (
          <TextField
            disabled={!canEdit}
            error={getApiFieldError(updateMutation.error, "subject")}
            id="template-subject"
            label="Subject"
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
            value={subject}
          />
        ) : null}
        <TextAreaField
          disabled={!canEdit}
          error={getApiFieldError(updateMutation.error, "body")}
          hint={
            isEmail
              ? undefined
              : `${body.length} characters. Texts longer than ${NOTIFICATION_UI_CONSTANTS.MAX_SMS_LENGTH} after placeholders are filled in are cut short.`
          }
          id="template-body"
          label="Message"
          maxLength={isEmail ? 4_000 : NOTIFICATION_UI_CONSTANTS.MAX_SMS_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          rows={isEmail ? 10 : 4}
          value={body}
        />
        <details className="rounded-lg border border-border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Placeholders you can use</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
            {variables.map((variable) => (
              <div className="contents" key={variable.name}>
                <dt>
                  <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-ink">{`{{${variable.name}}}`}</code>
                </dt>
                <dd className="text-xs text-muted">{variable.description}</dd>
              </div>
            ))}
          </dl>
        </details>
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {canEdit && template.isCustom ? (
              <Button
                isLoading={resetMutation.isPending}
                onClick={() => resetMutation.mutate(target)}
                variant="ghost"
              >
                Use our wording
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="secondary">
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit ? (
              <Button isLoading={updateMutation.isPending} type="submit">
                Save message
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
