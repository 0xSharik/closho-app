/**
 * Keep the fee displayed before and during checkout in one place. The order
 * API remains authoritative when it returns its final order totals.
 */
export const SHIPPING_FEE = 99;

export const getShippingFee = (subtotal: number) => (subtotal > 0 ? SHIPPING_FEE : 0);
