"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form-controls";
import { FolderIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import {
  KNOWLEDGE_KIND_OPTIONS,
  KNOWLEDGE_UI_CONSTANTS,
} from "@/features/knowledge/constants/knowledge-ui.constants";
import {
  useCreateKnowledgeSource,
  useGetKnowledgeSource,
  useUpdateKnowledgeSource,
} from "@/generated/api/knowledge-base/knowledge-base";
import type {
  KnowledgeSourceKind,
  KnowledgeSourceResponse,
  KnowledgeSourceSummary,
} from "@/generated/api/models";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

interface KnowledgeSourceModalProps {
  businessId: string;
  onClose: () => void;
  onSaved: (source: KnowledgeSourceResponse) => void;
  /** The source to edit; omitted when adding one. */
  source?: KnowledgeSourceSummary;
}

/** Adds or edits a source. Editing loads the full text first. */
export function KnowledgeSourceModal({ businessId, onClose, onSaved, source }: KnowledgeSourceModalProps) {
  const sourceQuery = useGetKnowledgeSource(businessId, source?.id ?? "", {
    query: { enabled: Boolean(source) },
  });

  return (
    <Modal
      description="The booking assistant answers customer questions from this text only."
      isOpen
      onClose={onClose}
      title={source ? `Edit ${source.title}` : "Add knowledge"}
    >
      {source && sourceQuery.isPending ? (
        <div className="space-y-4 p-5 sm:p-6">
          <Skeleton className="h-11 w-full rounded-[10px]" />
          <Skeleton className="h-48 w-full rounded-[10px]" />
        </div>
      ) : source && sourceQuery.isError ? (
        <div className="p-5 sm:p-6">
          <Alert tone="danger">{getApiErrorMessage(sourceQuery.error, "This source could not be loaded.")}</Alert>
        </div>
      ) : (
        <KnowledgeSourceForm
          businessId={businessId}
          onClose={onClose}
          onSaved={onSaved}
          {...(sourceQuery.data ? { source: sourceQuery.data } : {})}
        />
      )}
    </Modal>
  );
}

type FieldErrors = Partial<Record<"title" | "content" | "upload", string>>;

function KnowledgeSourceForm({
  businessId,
  onClose,
  onSaved,
  source,
}: Omit<KnowledgeSourceModalProps, "source"> & { source?: KnowledgeSourceResponse }) {
  const createMutation = useCreateKnowledgeSource();
  const updateMutation = useUpdateKnowledgeSource();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(source?.title ?? "");
  const [kind, setKind] = useState<KnowledgeSourceKind>(source?.kind ?? "FAQ");
  const [content, setContent] = useState(source?.content ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const mutation = source ? updateMutation : createMutation;
  const selectedKind = KNOWLEDGE_KIND_OPTIONS.find((option) => option.value === kind);

  function validate(): boolean {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length < KNOWLEDGE_UI_CONSTANTS.MIN_TITLE_LENGTH) {
      errors.title = "Enter a title with at least 2 characters.";
    }
    if (trimmedContent.length < KNOWLEDGE_UI_CONSTANTS.MIN_CONTENT_LENGTH) {
      errors.content = "Enter at least a sentence for the assistant to use.";
    } else if (trimmedContent.length > KNOWLEDGE_UI_CONSTANTS.MAX_CONTENT_LENGTH) {
      errors.content = "Keep each source under 100,000 characters; split longer documents.";
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";
    if (!file) return;

    if (file.size > KNOWLEDGE_UI_CONSTANTS.MAX_UPLOAD_BYTES) {
      setFieldErrors((current) => ({ ...current, upload: "Choose a text file under 200 KB." }));
      return;
    }

    const text = await file.text();

    setContent(text);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    setFieldErrors((current) => ({ ...current, upload: undefined, content: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) return;

    if (source) {
      updateMutation.mutate(
        {
          businessId,
          sourceId: source.id,
          data: { title: title.trim(), kind, ...(content !== source.content ? { content } : {}) },
        },
        { onSuccess: onSaved },
      );
      return;
    }

    createMutation.mutate({ businessId, data: { title: title.trim(), kind, content } }, { onSuccess: onSaved });
  }

  return (
    <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
      {mutation.error ? (
        <Alert tone="danger">{getApiErrorMessage(mutation.error, "The source could not be saved.")}</Alert>
      ) : null}

      <TextField
        error={fieldErrors.title ?? getApiFieldError(mutation.error, "title")}
        id="knowledge-title"
        label="Title"
        maxLength={KNOWLEDGE_UI_CONSTANTS.MAX_TITLE_LENGTH}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Cancellation policy"
        value={title}
      />

      <SelectField
        hint={selectedKind?.description}
        id="knowledge-kind"
        label="Type"
        onChange={(event) => setKind(event.target.value as KnowledgeSourceKind)}
        value={kind}
      >
        {KNOWLEDGE_KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        className="min-h-56"
        error={fieldErrors.content ?? getApiFieldError(mutation.error, "content")}
        hint="Plain text or Markdown. Short headed sections work best."
        id="knowledge-content"
        label="Content"
        onChange={(event) => setContent(event.target.value)}
        placeholder={"## Cancellations\n\nCancel free of charge up to 24 hours before your appointment."}
        value={content}
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          accept={KNOWLEDGE_UI_CONSTANTS.UPLOAD_ACCEPT}
          className="sr-only"
          id="knowledge-upload"
          onChange={(event) => void handleUpload(event)}
          ref={fileInputRef}
          type="file"
        />
        <Button
          leadingIcon={<FolderIcon className="size-4" />}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          variant="secondary"
        >
          Load from file
        </Button>
        <span className="text-xs text-muted">.txt or .md, replaces the text above</span>
        {fieldErrors.upload ? <p className="w-full text-xs text-danger">{fieldErrors.upload}</p> : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="secondary">
          Cancel
        </Button>
        <Button isLoading={mutation.isPending} type="submit">
          {source ? "Save changes" : "Add knowledge"}
        </Button>
      </div>
    </form>
  );
}
