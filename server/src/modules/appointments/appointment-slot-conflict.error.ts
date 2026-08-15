export class AppointmentSlotConflictError extends Error {
  public constructor() {
    super("The requested appointment overlaps an existing appointment");
    this.name = "AppointmentSlotConflictError";
  }
}
