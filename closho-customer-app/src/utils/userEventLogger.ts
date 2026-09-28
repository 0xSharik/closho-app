/**
 * Small, safe console logger for customer actions. Keep values limited to
 * identifiers, counts, flags, and error status codes: never log credentials,
 * authentication tokens, contact details, addresses, payment data, or OTPs.
 */
type EventDetails = Record<string, string | number | boolean | null | undefined>;

const cleanDetails = (details: EventDetails = {}) =>
  Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined)
  );

export const logUserEvent = (event: string, details: EventDetails = {}) => {
  console.info(`[USER_EVENT] ${event}`, cleanDetails(details));
};

export const logValidationFailure = (flow: string, fields: string[]) => {
  logUserEvent(`${flow}.validation_failed`, { fields: fields.join(',') || 'unknown' });
};

export const logUserActionFailure = (
  event: string,
  error: unknown,
  details: EventDetails = {}
) => {
  const axiosError = error as { response?: { status?: number; data?: { errorCode?: string } }; code?: string };
  console.warn(`[USER_EVENT] ${event}`, cleanDetails({
    ...details,
    status: axiosError?.response?.status,
    errorCode: axiosError?.response?.data?.errorCode || axiosError?.code || 'unknown',
  }));
};
