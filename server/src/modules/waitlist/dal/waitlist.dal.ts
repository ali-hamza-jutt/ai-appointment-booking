import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  CreateWaitlistEntryData,
  WaitlistEntryRecord,
  WaitlistOfferRecord,
  WaitlistOfferStatus,
  WaitlistStatus,
} from "../dto/waitlist.dto.js";

const ACTIVE: WaitlistStatus[] = ["WAITING", "OFFERED"];
const DAY = 24 * 60 * 60 * 1_000;

const entrySelect = {
  id: true,
  businessId: true,
  customerId: true,
  userId: true,
  serviceId: true,
  staffId: true,
  fromDate: true,
  toDate: true,
  partOfDay: true,
  timeZone: true,
  status: true,
  createdAt: true,
  business: { select: { id: true, name: true, slug: true } },
  service: { select: { id: true, name: true } },
  staff: { select: { id: true, displayName: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  // The time held for the customer right now, if any.
  offers: {
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { bookingId: true, startsAt: true, expiresAt: true },
  },
} as const;

const offerSelect = { id: true, businessId: true, entryId: true, bookingId: true, status: true } as const;

export class WaitlistDal {
  public createEntry(data: CreateWaitlistEntryData): Promise<WaitlistEntryRecord> {
    return prisma.waitlistEntry.create({ data, select: entrySelect });
  }

  public countActive(businessId: string, userId: string): Promise<number> {
    return prisma.waitlistEntry.count({ where: { businessId, userId, status: { in: ACTIVE } } });
  }

  /** The same wait already on the list, so joining twice doesn't add a second entry. */
  public findSame(data: CreateWaitlistEntryData): Promise<WaitlistEntryRecord | null> {
    return prisma.waitlistEntry.findFirst({
      where: {
        businessId: data.businessId,
        userId: data.userId,
        serviceId: data.serviceId,
        staffId: data.staffId,
        fromDate: data.fromDate,
        toDate: data.toDate,
        partOfDay: data.partOfDay,
        status: { in: ACTIVE },
      },
      select: entrySelect,
    });
  }

  public listForUser(userId: string, take: number): Promise<WaitlistEntryRecord[]> {
    return prisma.waitlistEntry.findMany({
      where: { userId, status: { in: ACTIVE } },
      orderBy: { createdAt: "desc" },
      take,
      select: entrySelect,
    });
  }

  public listForBusiness(businessId: string, take: number): Promise<WaitlistEntryRecord[]> {
    return prisma.waitlistEntry.findMany({
      where: { businessId, status: { in: ACTIVE } },
      orderBy: { createdAt: "asc" },
      take,
      select: entrySelect,
    });
  }

  public findForUser(userId: string, entryId: string): Promise<WaitlistEntryRecord | null> {
    return prisma.waitlistEntry.findFirst({ where: { userId, id: entryId }, select: entrySelect });
  }

  /**
   * Waiting customers for a service, in the order they joined, whose dates
   * could include the freed time and who were not already offered it. The
   * exact date and part of day are checked in each customer's time zone after.
   */
  public listCandidates(
    businessId: string,
    serviceId: string,
    startsAt: Date,
    staffId: string | null,
    take: number,
  ): Promise<WaitlistEntryRecord[]> {
    return prisma.waitlistEntry.findMany({
      where: {
        businessId,
        serviceId,
        status: "WAITING",
        // Dates are local; a day either side covers every time zone.
        fromDate: { lte: new Date(startsAt.getTime() + DAY) },
        toDate: { gte: new Date(startsAt.getTime() - DAY) },
        offers: { none: { startsAt, staffId } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: entrySelect,
    });
  }

  public async setEntryStatus(
    businessId: string,
    entryId: string,
    status: WaitlistStatus,
    from: readonly WaitlistStatus[],
  ): Promise<boolean> {
    const { count } = await prisma.waitlistEntry.updateMany({
      where: { businessId, id: entryId, status: { in: [...from] } },
      data: { status },
    });

    return count > 0;
  }

  public async createOffer(data: {
    businessId: string;
    entryId: string;
    bookingId: string;
    staffId: string | null;
    startsAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.waitlistOffer.create({ data });
  }

  public findOfferByBooking(businessId: string, bookingId: string): Promise<WaitlistOfferRecord | null> {
    return prisma.waitlistOffer.findFirst({ where: { businessId, bookingId }, select: offerSelect });
  }

  public async setOfferStatus(
    offer: WaitlistOfferRecord,
    status: WaitlistOfferStatus,
    from: readonly WaitlistOfferStatus[],
  ): Promise<boolean> {
    const { count } = await prisma.waitlistOffer.updateMany({
      where: { businessId: offer.businessId, bookingId: offer.bookingId, status: { in: [...from] } },
      data: { status },
    });

    return count > 0;
  }
}

export const waitlistDal = new WaitlistDal();
