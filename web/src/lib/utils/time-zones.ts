const UTC_TIME_ZONE = "UTC";

/**
 * Lists IANA zones for pickers. `Intl.supportedValuesOf` omits aliases such as
 * UTC, so the current value is always included to keep the select truthful.
 */
export function getSupportedTimeZones(currentTimeZone?: string): string[] {
  let timeZones: string[];

  try {
    timeZones = Intl.supportedValuesOf("timeZone");
  } catch {
    timeZones = [];
  }

  const leadingZones = [UTC_TIME_ZONE, currentTimeZone].filter(
    (zone): zone is string => Boolean(zone) && !timeZones.includes(zone as string),
  );

  return [...new Set([...leadingZones, ...timeZones])];
}
