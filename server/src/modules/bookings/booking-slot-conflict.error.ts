export class BookingSlotConflictError extends Error {
  public constructor() {
    super("The requested booking overlaps an existing booking");
    this.name = "BookingSlotConflictError";
  }
}
