import type { EmailAddress, PhoneNumberInput } from "../../auth/dto/auth.dto.js";

export interface GuestCodeRequest {
  email: EmailAddress;
}

export interface GuestVerifyRequest {
  email: EmailAddress;
  /** The 6-digit code from the email. @pattern ^\d{6}$ */
  code: string;
  /** Used for a new account; an existing one keeps its name. @minLength 2 @maxLength 80 */
  name: string;
  /** Saved on the customer's record at this business so it can text them. */
  phone?: PhoneNumberInput;
}

export interface AllowedOriginResponse {
  id: string;
  origin: string;
  createdAt: Date;
}

export interface AllowedOriginListResponse {
  items: AllowedOriginResponse[];
}

export interface AddAllowedOriginRequest {
  /** A website address such as https://glowsalon.com; only its scheme, host and port are kept. @maxLength 200 */
  origin: string;
}

/** Where the business's booking widget may be embedded. */
export interface EmbedPolicyResponse {
  origins: string[];
}
