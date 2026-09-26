import type {
  WorkingHoursInput,
  WorkingHoursResponse,
} from "@/generated/api/models";

export interface ShiftDraft {
  key: string;
  startTime: string;
  endTime: string;
}

export type WeeklyDraft = Record<number, ShiftDraft[]>;

let draftSequence = 0;

export function createShiftDraft(startTime: string, endTime: string): ShiftDraft {
  draftSequence += 1;

  return { key: `shift-${draftSequence}`, startTime, endTime };
}

export function toWeeklyDraft(items: WorkingHoursResponse[]): WeeklyDraft {
  const draft: WeeklyDraft = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

  for (const item of items) {
    draft[item.weekday]?.push(createShiftDraft(item.startTime, item.endTime));
  }

  return draft;
}

export function toWorkingHoursInput(draft: WeeklyDraft): WorkingHoursInput[] {
  return Object.entries(draft).flatMap(([weekday, shifts]) =>
    shifts.map((shift) => ({
      weekday: Number(weekday),
      startTime: shift.startTime,
      endTime: shift.endTime,
    })),
  );
}

export function isOvernightShift(shift: ShiftDraft): boolean {
  return shift.endTime <= shift.startTime;
}
