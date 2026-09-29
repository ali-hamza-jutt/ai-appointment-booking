import {
  ERROR_CODES,
  ERROR_MESSAGES,
  NOTIFICATION_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { notificationDal } from "./dal/notification.dal.js";
import type {
  BookingNotificationListResponse,
  MyNotificationSettingsResponse,
  NotificationChannel,
  NotificationKind,
  NotificationTemplateListResponse,
  NotificationTemplateResponse,
  TemplateChannel,
  UpdateMyNotificationSettingRequest,
  UpdateNotificationTemplateRequest,
} from "./dto/notification.dto.js";
import {
  DEFAULT_TEMPLATES,
  findTemplateProblems,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  TEMPLATE_VARIABLES,
} from "./notification-templates.js";

function isChannel(value: string): value is TemplateChannel {
  return (NOTIFICATION_CHANNELS as string[]).includes(value);
}

function isKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as string[]).includes(value);
}

/** Business message templates, customers' channel choices and the per-booking message log. */
export class NotificationSettingsService {
  public async listTemplates(businessId: string): Promise<NotificationTemplateListResponse> {
    const custom = await notificationDal.listTemplates(businessId);
    const items = NOTIFICATION_CHANNELS.flatMap((channel) =>
      NOTIFICATION_KINDS.map((kind): NotificationTemplateResponse => {
        const saved = custom.find((template) => template.channel === channel && template.kind === kind);
        const template = saved ?? DEFAULT_TEMPLATES[channel][kind];

        return { channel, kind, subject: template.subject, body: template.body, isCustom: Boolean(saved) };
      }),
    );

    return { items, variables: [...TEMPLATE_VARIABLES] };
  }

  public async updateTemplate(
    businessId: string,
    channelParam: string,
    kindParam: string,
    request: UpdateNotificationTemplateRequest,
  ): Promise<NotificationTemplateResponse> {
    const { channel, kind } = this.parseTemplateKey(channelParam, kindParam);
    const body = request.body.trim();
    const subject = channel === "EMAIL" ? normalizeWhitespace(request.subject ?? "") : null;
    const maxBody =
      channel === "SMS" ? NOTIFICATION_CONSTANTS.MAX_SMS_BODY_LENGTH : NOTIFICATION_CONSTANTS.MAX_EMAIL_BODY_LENGTH;

    if (!body || body.length > maxBody) {
      throwRequestValidationError("body", `Message must contain between 1 and ${maxBody} characters`);
    }

    if (channel === "EMAIL" && (!subject || subject.length > NOTIFICATION_CONSTANTS.MAX_SUBJECT_LENGTH)) {
      throwRequestValidationError(
        "subject",
        `Subject must contain between 1 and ${NOTIFICATION_CONSTANTS.MAX_SUBJECT_LENGTH} characters`,
      );
    }

    for (const [field, text] of [["subject", subject ?? ""], ["body", body]] as const) {
      const problems = findTemplateProblems(text);

      if (problems.length > 0) throwRequestValidationError(field, problems.join(". "));
    }

    const saved = await notificationDal.upsertTemplate(businessId, { channel, kind, subject, body });

    return { ...saved, isCustom: true };
  }

  /** Goes back to the built-in wording. */
  public async resetTemplate(businessId: string, channelParam: string, kindParam: string): Promise<void> {
    const { channel, kind } = this.parseTemplateKey(channelParam, kindParam);

    await notificationDal.deleteTemplate(businessId, channel, kind);
  }

  public async listForBooking(businessId: string, bookingId: string): Promise<BookingNotificationListResponse> {
    if (!VALIDATION_PATTERNS.UUID.test(bookingId)) {
      throw new AppError(404, ERROR_CODES.APPOINTMENT_NOT_FOUND, ERROR_MESSAGES.APPOINTMENT_NOT_FOUND);
    }

    return {
      items: await notificationDal.listForBooking(businessId, bookingId, NOTIFICATION_CONSTANTS.BOOKING_LOG_LIMIT),
    };
  }

  /** Every business the user has booked with, and whether each may email or text them. */
  public async listMySettings(userId: string): Promise<MyNotificationSettingsResponse> {
    const customers = await notificationDal.listSettingsForUser(userId);
    const optedIn = (preferences: Array<{ channel: NotificationChannel; optedIn: boolean }>, channel: NotificationChannel) =>
      preferences.find((preference) => preference.channel === channel)?.optedIn ?? true;

    return {
      items: customers.map((customer) => ({
        business: customer.business,
        email: optedIn(customer.preferences, "EMAIL"),
        sms: optedIn(customer.preferences, "SMS"),
        push: optedIn(customer.preferences, "PUSH"),
      })),
    };
  }

  public async updateMySetting(
    userId: string,
    businessId: string,
    request: UpdateMyNotificationSettingRequest,
  ): Promise<void> {
    const customerId = VALIDATION_PATTERNS.UUID.test(businessId)
      ? await notificationDal.findCustomerIdForUser(businessId, userId)
      : null;

    if (!customerId) {
      throw new AppError(404, ERROR_CODES.BUSINESS_NOT_FOUND, ERROR_MESSAGES.BUSINESS_NOT_FOUND);
    }

    await notificationDal.setPreference(businessId, customerId, request.channel, request.optedIn);
  }

  private parseTemplateKey(channel: string, kind: string): { channel: TemplateChannel; kind: NotificationKind } {
    const upperChannel = channel.toUpperCase();
    const upperKind = kind.toUpperCase();

    if (!isChannel(upperChannel) || !isKind(upperKind)) {
      throw new AppError(404, ERROR_CODES.NOTIFICATION_TEMPLATE_NOT_FOUND, ERROR_MESSAGES.NOTIFICATION_TEMPLATE_NOT_FOUND);
    }

    return { channel: upperChannel, kind: upperKind };
  }
}

export const notificationSettingsService = new NotificationSettingsService();
