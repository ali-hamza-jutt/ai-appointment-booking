import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  CreateCustomerData,
  CustomerRecord,
  ListCustomersData,
} from "../dto/customer.dto.js";

export const customerSelect = {
  id: true,
  userId: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
} as const;

export class CustomerDal {
  public createCustomer(data: CreateCustomerData): Promise<CustomerRecord> {
    return prisma.customer.create({
      data,
      select: customerSelect,
    });
  }

  public listCustomers(data: ListCustomersData): Promise<CustomerRecord[]> {
    return prisma.customer.findMany({
      where: {
        businessId: data.businessId,
        ...(data.search
          ? {
              OR: [
                { name: { contains: data.search, mode: "insensitive" } },
                { email: { contains: data.search, mode: "insensitive" } },
                { phone: { contains: data.search } },
              ],
            }
          : {}),
        ...(data.cursor
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: data.cursor.createdAt } },
                    {
                      createdAt: data.cursor.createdAt,
                      id: { lt: data.cursor.id },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: data.take,
      select: customerSelect,
    });
  }
}

export const customerDal = new CustomerDal();
