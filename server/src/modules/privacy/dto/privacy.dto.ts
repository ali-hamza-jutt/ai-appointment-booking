export interface ExportedBooking {
  id: string;
  serviceName: string;
  staffName: string | null;
  scheduledAt: Date;
  status: string;
  priceMinor: number | null;
  currency: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface ExportedChatMessage {
  role: string;
  content: string;
  createdAt: Date;
}

export interface ExportedChat {
  id: string;
  channel: string;
  createdAt: Date;
  messages: ExportedChatMessage[];
}

export interface ExportedReview {
  rating: number;
  comment: string | null;
  reply: string | null;
  createdAt: Date;
}

export interface ExportedWaitlistEntry {
  serviceName: string;
  fromDate: string;
  toDate: string;
  status: string;
  createdAt: Date;
}

export interface ExportedPreference {
  key: string;
  value: string;
  source: string;
}

export interface ExportedNotification {
  channel: string;
  kind: string;
  status: string;
  recipient: string;
  createdAt: Date;
}

/** Everything one business holds about one customer. */
export interface CustomerDataExport {
  business: { id: string; name: string };
  customer: { id: string; name: string; email: string | null; phone: string | null; notes: string | null; createdAt: Date };
  bookings: ExportedBooking[];
  chats: ExportedChat[];
  reviews: ExportedReview[];
  waitlist: ExportedWaitlistEntry[];
  preferences: ExportedPreference[];
  notifications: ExportedNotification[];
  exportedAt: Date;
}

/** Everything BookWise holds about the signed-in person. */
export interface MyDataExport {
  account: { id: string; email: string; fullName: string; phone: string | null; createdAt: Date };
  businesses: CustomerDataExport[];
  exportedAt: Date;
}

export interface DeleteAccountRequest {
  /** The account's email address, typed out to confirm. @maxLength 254 */
  confirmEmail: string;
}
